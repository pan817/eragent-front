import { runAnalysisTask } from './analysisStream';
import { installFakeEventSource, getLastEventSource, FakeEventSource } from '../test/fakeEventSource';
import type { TaskSnapshot } from '../types/api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let uninstallES: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  uninstallES = installFakeEventSource();
  mockFetch.mockReset();
});

afterEach(() => {
  uninstallES();
  vi.useRealTimers();
});

function makeHandlers() {
  return {
    onStage: vi.fn(),
    onTimelineAppend: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

function mockSnapshotOk(): TaskSnapshot {
  return {
    trace_id: 't1',
    status: 'ok',
    session_id: 's1',
    user_id: 'u1',
    created_at: '2026-04-14T10:00:00Z',
    result: {
      report_id: 'r1',
      status: 'success',
      analysis_type: 'three_way_match',
      query: 'q',
      user_id: 'u1',
      session_id: 's1',
      time_range: '',
      anomalies: [],
      supplier_kpis: [],
      summary: {},
      report_markdown: '## ok',
      error: null,
      completed_tasks: [],
      failed_tasks: [],
      created_at: '2026-04-14T10:00:00Z',
      duration_ms: 1000,
    },
  };
}

describe('runAnalysisTask', () => {
  it('maps stage events to onStage + onTimelineAppend', async () => {
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    es.emit('stage', {
      type: 'stage',
      trace_id: 't1',
      ts: '2026-04-14T10:00:01Z',
      seq: 1,
      name: 'intent_resolved',
    });

    expect(h.onStage).toHaveBeenCalledWith('已识别分析意图');
    expect(h.onTimelineAppend).toHaveBeenCalledTimes(1);
    expect(h.onTimelineAppend.mock.calls[0][0].text).toBe('已识别分析意图');
  });

  it('tool start updates stage, tool end appends timeline', async () => {
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();

    getLastEventSource()!.emit('tool', {
      type: 'tool', trace_id: 't1', ts: 'x', seq: 1,
      action: 'start', name: 'query_purchase_orders',
    });
    expect(h.onStage).toHaveBeenCalledWith('正在查询采购订单');
    expect(h.onTimelineAppend).not.toHaveBeenCalled();

    getLastEventSource()!.emit('tool', {
      type: 'tool', trace_id: 't1', ts: 'x', seq: 2,
      action: 'end', name: 'query_purchase_orders', duration_ms: 1200, status: 'ok',
    });
    expect(h.onTimelineAppend).toHaveBeenCalledTimes(1);
    expect(h.onTimelineAppend.mock.calls[0][0]).toMatchObject({
      text: '查询采购订单完成',
      durationMs: 1200,
    });
  });

  it('on done, fetches snapshot and calls onDone', async () => {
    const snap = mockSnapshotOk();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(snap) });
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();

    getLastEventSource()!.emit('done', {
      type: 'done', trace_id: 't1', ts: 'x', seq: 10,
      status: 'ok', duration_ms: 3000,
    });

    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalledTimes(1));
    expect(h.onDone.mock.calls[0][0]).toEqual(snap);
    expect(getLastEventSource()!.closed).toBe(true);
  });

  it('connection error before open falls back to polling', async () => {
    const snap = mockSnapshotOk();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(snap) });
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;

    // 未 open 直接 error → 立即降级轮询
    es.error();
    expect(es.closed).toBe(true);

    // 轮询循环第一次 tick 就能拿到 ok 快照
    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    expect(h.onDone.mock.calls[0][0]).toEqual(snap);
  });

  it('no event for 30s triggers polling fallback', async () => {
    const snap = mockSnapshotOk();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(snap) });
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    // watchdog 每 5s 检查一次；open 时 lastEventAt=0，第一次 > 30s 的检查在 t=35s
    await vi.advanceTimersByTimeAsync(36_000);

    expect(es.closed).toBe(true);
    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
  });

  it('cleanup stops event delivery and timers', () => {
    const h = makeHandlers();
    const cleanup = runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    cleanup();
    expect(es.closed).toBe(true);

    es.emit('stage', {
      type: 'stage', trace_id: 't1', ts: 'x', seq: 1, name: 'intent_resolved',
    });
    expect(h.onStage).not.toHaveBeenCalled();
  });

  it('unknown stage name does not emit', () => {
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();

    getLastEventSource()!.emit('stage', {
      type: 'stage', trace_id: 't1', ts: 'x', seq: 1, name: 'some_new_stage',
    });

    expect(h.onStage).not.toHaveBeenCalled();
    expect(h.onTimelineAppend).not.toHaveBeenCalled();
  });

  it('heartbeat does NOT reset watchdog (heartbeat-only stream still degrades)', async () => {
    // 后端已知 bug：任务完成后不发 done 只发 heartbeat。
    // heartbeat 不应被视为"任务有进展"，否则前端会挂到 15 分钟全局超时。
    const snap = mockSnapshotOk();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(snap) });
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    // 每 10s 推一次 heartbeat（模拟后端只发心跳）
    for (let t = 10_000; t <= 40_000; t += 10_000) {
      await vi.advanceTimersByTimeAsync(10_000);
      es.emit('heartbeat', { type: 'heartbeat', trace_id: 't1', ts: 'x', seq: t / 1000 });
    }

    // 即便心跳在跳，lastEventAt 停在 open 时的 0；
    // watchdog 在 t>=35s 触发降级 → 拉快照拿到 ok
    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    expect(es.closed).toBe(true);
  });

  it('non-heartbeat event resets watchdog', async () => {
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    // 10s 后推一条业务事件，重置 watchdog
    await vi.advanceTimersByTimeAsync(10_000);
    es.emit('stage', {
      type: 'stage', trace_id: 't1', ts: 'x', seq: 1, name: 'intent_resolved',
    });

    // 再过 20s（总共 30s），未到 lastEventAt + 30s 的阈值
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(es.closed).toBe(false);
  });
});
