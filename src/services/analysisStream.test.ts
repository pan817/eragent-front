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
    onDegraded: vi.fn(),
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

  it('non-heartbeat event resets watchdog and upgrades to warm window', async () => {
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    // 10s 后推一条业务事件：刷新 lastEventAt 并从冷窗口(30s)切到暖窗口(180s)
    await vi.advanceTimersByTimeAsync(10_000);
    es.emit('stage', {
      type: 'stage', trace_id: 't1', ts: 'x', seq: 1, name: 'intent_resolved',
    });

    // 再过 20s（若仍是冷窗口会降级，暖窗口下不会）
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(es.closed).toBe(false);
  });

  it('warm window tolerates 60s silence between business events (long LLM call)', async () => {
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    // 建连后立刻收到一条业务事件 → 进入暖窗口
    es.emit('stage', {
      type: 'stage', trace_id: 't1', ts: 'x', seq: 1, name: 'intent_resolved',
    });

    // 模拟 60s 无事件（一次长 LLM 调用），应当不触发降级
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(es.closed).toBe(false);
    expect(h.onDegraded).not.toHaveBeenCalled();
  });

  it('warm window finally degrades after > 180s silence', async () => {
    const snap = mockSnapshotOk();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(snap) });
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    es.emit('stage', {
      type: 'stage', trace_id: 't1', ts: 'x', seq: 1, name: 'intent_resolved',
    });

    // 185s 静默 → 超过 180s 暖窗口 → 降级
    await vi.advanceTimersByTimeAsync(185_000);
    expect(es.closed).toBe(true);
    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
  });

  it('polling 5 consecutive failures triggers finishError (circuit breaker)', async () => {
    // 降级后轮询 fetchTaskSnapshot 连续返回 500（ApiError 非 network），
    // 应在 5 次连续失败后 finishError，而不是无限重试 15 分钟
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    // 让 SSE 建连失败立即降级到轮询
    es.error();

    // 让 fetchTaskSnapshot 持续失败（模拟 500）
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // 第 1 次 tick 是 startPolling() 里立即触发的；后续每 2s 一次
    // 5 次连续失败 ≈ 第 5 次 tick 触发 finishError
    await vi.advanceTimersByTimeAsync(12_000);
    expect(h.onError).toHaveBeenCalled();
    expect(h.onError.mock.calls[0][0].message).toMatch(/连续.*次请求失败/);
  });

  it('polling failures reset on success (circuit breaker does not trip intermittently)', async () => {
    // 2 次失败后成功一次，再 2 次失败 —— 总共 4 次失败，但连续最多 2 次，不应熔断
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.error();

    const failResp = { ok: false, status: 500, statusText: '' };
    const okRunning = {
      ok: true,
      json: () =>
        Promise.resolve({
          trace_id: 't1',
          status: 'running',
          session_id: 's1',
          user_id: 'u1',
          created_at: 'x',
        }),
    };
    mockFetch
      .mockResolvedValueOnce(failResp)
      .mockResolvedValueOnce(failResp)
      .mockResolvedValueOnce(okRunning)
      .mockResolvedValueOnce(failResp)
      .mockResolvedValueOnce(failResp)
      .mockResolvedValue(okRunning);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('SSE post-connect error counts toward failure cap', async () => {
    // 建连成功后反复 error()（模拟 backend 持续断线重连），累计到阈值后熔断
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    // 连续 5 次 onerror（不中间夹任何业务事件）→ 熔断 finishError
    for (let i = 0; i < 5; i++) {
      es.error();
    }
    expect(h.onError).toHaveBeenCalled();
    expect(h.onError.mock.calls[0][0].message).toMatch(/连续.*次请求失败/);
    expect(es.closed).toBe(true);
  });

  it('business event resets SSE onerror counter', async () => {
    // SSE 报错几次 → 中间收到业务事件 → 计数器清零 → 继续容忍
    const h = makeHandlers();
    runAnalysisTask('t1', h);
    const es = getLastEventSource()!;
    es.open();

    // 先 3 次 error（未达阈值 5）
    es.error();
    es.error();
    es.error();
    expect(h.onError).not.toHaveBeenCalled();

    // 一条业务事件：清零计数
    es.emit('stage', {
      type: 'stage', trace_id: 't1', ts: 'x', seq: 1, name: 'intent_resolved',
    });

    // 再 4 次 error —— 如果没清零，累计 7 次已超阈值；清零后只算 4 次，不应熔断
    es.error();
    es.error();
    es.error();
    es.error();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('done: retries stale snapshot (status=running) and uses terminal one when it arrives', async () => {
    // 模拟后端时序 bug：done 事件推出后，第一次拉快照仍返回 running，
    // 1s 后重试拿到 ok 终态。前端应用真实终态（带 result），不走 fallback 占位。
    const runningSnap = {
      trace_id: 't1',
      status: 'running',
      session_id: 's1',
      user_id: 'u1',
      created_at: 'x',
      result: null,
      error: null,
    };
    const okSnap = mockSnapshotOk();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(runningSnap) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(okSnap) });

    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();
    getLastEventSource()!.emit('done', {
      type: 'done', trace_id: 't1', ts: 'x', seq: 10,
      status: 'ok', duration_ms: 3000,
    });

    // 推进时钟，让 1s 重试延迟过期
    await vi.advanceTimersByTimeAsync(1_100);

    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    // 应该用第二次返回的真实 ok 快照，而不是 fallback 占位
    expect(h.onDone.mock.calls[0][0]).toEqual(okSnap);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('done: all snapshot attempts stale → fallback to done event with placeholder', async () => {
    // 所有 3 次重试都拿到 running → 走 fallback，用 done 事件的 status:ok 构造占位
    const runningSnap = {
      trace_id: 't1',
      status: 'running',
      session_id: 's1',
      user_id: 'u1',
      created_at: 'x',
      result: null,
      error: null,
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(runningSnap) });

    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();
    getLastEventSource()!.emit('done', {
      type: 'done', trace_id: 't1', ts: 'x', seq: 10,
      status: 'ok', duration_ms: 3000,
    });

    // 推进 3s 让所有重试耗尽
    await vi.advanceTimersByTimeAsync(3_500);

    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    const delivered = h.onDone.mock.calls[0][0];
    // fallback 构造的 ok 快照（带占位 markdown）
    expect(delivered.status).toBe('ok');
    expect(delivered.result?.report_markdown).toMatch(/分析已完成，但报告详情暂时无法加载/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('done: snapshot fetch throws → fallback immediately (no retry on network error)', async () => {
    // 第一次 fetch 就抛网络错（500）。按设计不在这里重试，直接走 fallback
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();
    getLastEventSource()!.emit('done', {
      type: 'done', trace_id: 't1', ts: 'x', seq: 10,
      status: 'ok', duration_ms: 3000,
    });

    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    expect(h.onDone.mock.calls[0][0].result?.report_markdown).toMatch(/分析已完成/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('done with status=error falls back to done event error', async () => {
    // done 事件自己就是失败，且 snapshot 不可用 → fallback 的 error 分支
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: '',
    });

    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();
    getLastEventSource()!.emit('done', {
      type: 'done', trace_id: 't1', ts: 'x', seq: 10,
      status: 'error', duration_ms: 1000,
      error: { code: 'LLM_ERROR', message: 'rate limit' },
    });

    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    const delivered = h.onDone.mock.calls[0][0];
    expect(delivered.status).toBe('error');
    expect(delivered.error?.code).toBe('LLM_ERROR');
  });

  it('done: retries snapshot with status=ok but result=null (contract violation)', async () => {
    // 后端契约要求 status=ok 必须带 result（docs/async_analyze_frontend.md §3.2）。
    // 实测后端在 status 已翻 ok 之后仍有短时间 result=null，重试拿到完整数据后应用真实结果
    const okNoResultSnap = {
      trace_id: 't1',
      status: 'ok',
      session_id: 's1',
      user_id: 'u1',
      created_at: 'x',
      started_at: 'x',
      finished_at: 'y',
      duration_ms: 15000,
      stage: null,
      result: null,
      error: null,
    };
    const okSnap = mockSnapshotOk();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(okNoResultSnap) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(okSnap) });

    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();
    getLastEventSource()!.emit('done', {
      type: 'done', trace_id: 't1', ts: 'x', seq: 10,
      status: 'ok', duration_ms: 15000,
    });

    await vi.advanceTimersByTimeAsync(1_100);

    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    expect(h.onDone.mock.calls[0][0]).toEqual(okSnap);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('done: all snapshots return status=ok but result=null → fallback placeholder (not 分析失败)', async () => {
    // 3 次都拿到 {status:ok, result:null} → 应走 fallback 显示占位
    // 关键：不能让 applySnapshotToMessage 看到这种数据，否则会走失败分支显示"分析失败"
    const okNoResultSnap = {
      trace_id: 't1',
      status: 'ok',
      session_id: 's1',
      user_id: 'u1',
      created_at: 'x',
      finished_at: 'y',
      duration_ms: 15000,
      result: null,
      error: null,
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(okNoResultSnap) });

    const h = makeHandlers();
    runAnalysisTask('t1', h);
    getLastEventSource()!.open();
    getLastEventSource()!.emit('done', {
      type: 'done', trace_id: 't1', ts: 'x', seq: 10,
      status: 'ok', duration_ms: 15000,
    });

    await vi.advanceTimersByTimeAsync(3_500);

    await vi.waitFor(() => expect(h.onDone).toHaveBeenCalled());
    const delivered = h.onDone.mock.calls[0][0];
    // 必须是 fallback 占位，而不是 result=null 直通
    expect(delivered.status).toBe('ok');
    expect(delivered.result).toBeTruthy();
    expect(delivered.result?.report_markdown).toMatch(/分析已完成，但报告详情暂时无法加载/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
