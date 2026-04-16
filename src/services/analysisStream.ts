/**
 * 异步分析任务的事件流管理（纯函数层）。
 *
 * 职责：给一个 trace_id，开 SSE → 降级轮询 → 拉快照 → 把进度/终态推给回调。
 * 生命周期由 caller 管：调用方保存返回的 cleanup，卸载 / 切会话 / 重复调用时手动停。
 *
 * 决策点对照 docs/async_analyze_frontend.md 和设计讨论：
 *  - SSE：原生 EventSource + URL query（项目无鉴权，不传参即可）
 *  - 降级：建连失败立即降级；建连后 30s 无业务事件（heartbeat 不计入）降级；降级后关闭 SSE，仅轮询
 *  - 轮询：指数退避（2s 起，每次 running 翻倍，封顶 30s）；累计 15 分钟超时 → error
 *  - done：拉一次快照后回调 onDone；快照失败也走 onError
 *  - 时间线：stage 事件 + tool/dag_task 的 end 事件入时间线；heartbeat/report 不入
 */
import type {
  AnalysisTaskEvent,
  AnalysisTimelineEntry,
  ChunkEvent,
  DoneEvent,
  StageEvent,
  TaskSnapshot,
  ToolEvent,
  DagTaskEvent,
} from '../types/api';
import { ApiError, ApiErrorCode } from '../types/api';
import { fetchTaskSnapshot, taskEventStreamUrl } from './api';
import { stageText, toolText } from '../utils/analysisStageText';

/**
 * 冷启动窗口：从 SSE 建连开始，30s 内完全没收到任何业务事件就降级。
 * 主要用来捕获"后端 heartbeat-only"这种坏掉的场景。
 */
const COLD_NO_EVENT_TIMEOUT_MS = 30_000;
/**
 * 暖运行窗口：已经收到过至少一条业务事件后，后续事件间的静默容忍度。
 * 主要避免把"模型推理期间长时间无事件"误判为卡死——一次 LLM 调用 60-120s
 * 很常见，再留出余量到 180s。超过这个窗口仍无事件才降级。
 */
const WARM_NO_EVENT_TIMEOUT_MS = 180_000;
const NO_EVENT_CHECK_INTERVAL_MS = 5_000;
/**
 * 轮询起始间隔。拿到响应但任务仍 running 时，间隔按 2 倍翻至上限。
 * 翻倍只在"成功响应 + status=running"时进行：任务明显没进展就放慢节奏，
 * 避免 2s 固定间隔下 9.6 分钟挂起能打出 287 次请求。
 */
const POLL_INITIAL_INTERVAL_MS = 2_000;
const POLL_MAX_INTERVAL_MS = 30_000;
const GLOBAL_TIMEOUT_MS = 15 * 60 * 1000;
/**
 * 熔断：连续失败超此阈值立即 finishError。
 * 2s 轮询 × 5 次 ≈ 10s 确认真断，避免 504/500/SSE 反复 error 时无限重试。
 */
const MAX_CONSECUTIVE_FAILURES = 5;
/**
 * 熔断：整个任务周期累计失败上限。
 * 防止"成功一次 → 失败 N 次 → 成功一次"的抖动模式绕过连续计数器。
 */
const MAX_TOTAL_FAILURES = 10;
/**
 * SSE 推来 done 事件后，拉快照拿最终 result 的重试次数与间隔。
 * 实测后端存在一个时序 bug：done 事件推出后 GET /analyze/tasks/{id} 仍短暂返回
 * `{status: 'running', result: null}`。短重试兜住这个 race window，同时不会让
 * 用户等太久（3 次 × 1s = 最多 3s）。
 */
const SNAPSHOT_TERMINAL_MAX_ATTEMPTS = 3;
const SNAPSHOT_TERMINAL_RETRY_DELAY_MS = 1_000;
const SNAPSHOT_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'ok',
  'error',
  'aborted',
]);

export interface AnalysisStreamHandlers {
  /** 阶段文案变更（气泡内单行展示） */
  onStage: (text: string) => void;
  /** 时间线追加一条（折叠面板内时序展示） */
  onTimelineAppend: (entry: AnalysisTimelineEntry) => void;
  /**
   * 就地更新一条已入列的时间线条目：按 matchKey 找最近一条尚未完成（durationMs 缺失）的项，
   * 回填 patch 指定字段。找不到时调用方可选择 append 兜底，不强制。
   * 用于 tool/dag_task 的 start 先入"进行中"，end 到达后变成"完成 + 耗时"。
   */
  onTimelineUpdate: (matchKey: string, patch: { text: string; durationMs: number }) => void;
  /** 终态；snapshot.status 为 ok/error/aborted，result 与 error 二选一 */
  onDone: (snapshot: TaskSnapshot) => void;
  /** 流程里任何异常（建连失败未能降级、轮询超时、快照拉取失败等）。触发后不再 onDone */
  onError: (err: Error) => void;
  /** 流已从 SSE 降级为轮询。UI 可据此切换为"网络不稳定，正在查询结果..." */
  onDegraded?: () => void;
  /**
   * LLM 流式输出 token 级 chunk 事件（docs/sse_front_spec.md §3）。
   * ReAct 兜底路径不会触发；调用方必须支持"整个任务没有任何 chunk"的情况。
   * 注：chunk.seq=0，不参与全局 seq/Last-Event-ID 重放，断线丢失靠 done 拉快照兜底。
   */
  onChunk?: (chunk: ChunkEvent) => void;
}

export function runAnalysisTask(
  traceId: string,
  handlers: AnalysisStreamHandlers
): () => void {
  let stopped = false;
  let es: EventSource | null = null;
  let lastEventAt = Date.now();
  // 已经收到过至少一条业务事件（非 heartbeat）？决定 watchdog 用冷/暖窗口。
  let hasReceivedBusinessEvent = false;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollStartedAt: number | null = null;
  let pollInterval = POLL_INITIAL_INTERVAL_MS;
  // 失败熔断计数器：SSE onerror（已建连态）与轮询失败共用一套计数
  let consecutiveFailures = 0;
  let totalFailures = 0;
  // 整个任务周期共用一个 AbortController；cleanup 时 abort，所有在途 fetch 立刻取消，
  // 避免 cleanup 后仍有请求在飞、切会话/刷新时浪费带宽 + 触发熔断计数
  const ac = new AbortController();

  const globalStartedAt = Date.now();

  const cleanup = () => {
    stopped = true;
    if (es) { es.close(); es = null; }
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    ac.abort();
  };

  const isAbortError = (err: unknown) =>
    err instanceof ApiError && err.code === ApiErrorCode.ABORTED;

  const finishOk = (snapshot: TaskSnapshot) => {
    if (stopped) return;
    cleanup();
    handlers.onDone(snapshot);
  };

  const finishError = (err: Error) => {
    if (stopped) return;
    cleanup();
    handlers.onError(err);
  };

  /**
   * 记一次失败，超阈值则 finishError 并返回 true（调用方据此提前返回）。
   * SSE 断连（已建连态）、轮询 fetch 失败、轮询返回 5xx 都走这里。
   *
   * 熔断时统一抛出"连续/累计 N 次请求失败"的消息，底层 err 作为日志线索（console.warn），
   * 不直接作为用户可见文案 —— 用户看到的是"反复重试已停止"这件事，比单次 500 更准确。
   */
  const recordFailure = (err: Error): boolean => {
    consecutiveFailures++;
    totalFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.warn('[analysisStream] 熔断：连续失败过多', err);
      finishError(
        new ApiError(
          0,
          ApiErrorCode.NETWORK_ERROR,
          `连续 ${consecutiveFailures} 次请求失败，已停止重试`
        )
      );
      return true;
    }
    if (totalFailures >= MAX_TOTAL_FAILURES) {
      console.warn('[analysisStream] 熔断：累计失败过多', err);
      finishError(
        new ApiError(
          0,
          ApiErrorCode.NETWORK_ERROR,
          `累计 ${totalFailures} 次请求失败，已停止重试`
        )
      );
      return true;
    }
    return false;
  };

  const exceededGlobalTimeout = () =>
    Date.now() - globalStartedAt > GLOBAL_TIMEOUT_MS;

  const startPolling = () => {
    if (stopped || pollStartedAt !== null) return;
    pollStartedAt = Date.now();
    if (es) { es.close(); es = null; }
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    handlers.onDegraded?.();
    tick();
  };

  const tick = async () => {
    if (stopped) return;
    if (exceededGlobalTimeout()) {
      finishError(new ApiError(0, ApiErrorCode.TIMEOUT, '任务超时，请重新发起'));
      return;
    }
    try {
      const snap = await fetchTaskSnapshot(traceId, { signal: ac.signal });
      if (stopped) return;
      // 响应成功就算连续失败清零（status=ok/error/aborted 是业务终态，走 finishOk）
      consecutiveFailures = 0;
      if (snap.status === 'ok' || snap.status === 'error' || snap.status === 'aborted') {
        finishOk(snap);
        return;
      }
      // 依然 running：翻倍下一次间隔，任务明显没进展就放慢节奏
      pollInterval = Math.min(pollInterval * 2, POLL_MAX_INTERVAL_MS);
    } catch (err) {
      if (stopped) return;
      // abort 是调用方主动取消，不计入失败（cleanup 已经在 abort 之前把 stopped=true，
      // 这里基本走不到；留一道保险）
      if (isAbortError(err)) return;
      // 任何失败都计数（含 504/500 等 5xx、网络断、JSON 解析失败等）
      // 连续 MAX_CONSECUTIVE_FAILURES 次或累计 MAX_TOTAL_FAILURES 次 → 熔断，终止任务
      const e = err instanceof Error ? err : new Error(String(err));
      if (recordFailure(e)) return;
    }
    pollTimer = setTimeout(tick, pollInterval);
  };

  const pushTimeline = (text: string, matchKey?: string, durationMs?: number) => {
    if (stopped) return;
    handlers.onTimelineAppend({
      ts: new Date().toISOString(),
      text,
      durationMs,
      matchKey,
    });
  };

  const updateTimeline = (matchKey: string, text: string, durationMs: number) => {
    if (stopped) return;
    handlers.onTimelineUpdate(matchKey, { text, durationMs });
  };

  /**
   * 判断快照是否"可交付给 UI"。
   *
   * 契约（docs/async_analyze_frontend.md §3.2）：status=ok 必须带 result；
   * status=error/aborted 允许无 error.code（错误状态自身即终态）。
   *
   * 实测后端两种滞后：
   *   A. status 还在 running/queued（docs/async_analyze_backend_issue.md Issue 2）
   *   B. status 已是 ok 但 result 仍是 null
   * 两种都不该立即交付，重试窗口内等后端补齐。
   */
  const isSnapshotReadyToDeliver = (snap: TaskSnapshot): boolean => {
    if (snap.status === 'ok') return !!snap.result;
    return SNAPSHOT_TERMINAL_STATUSES.has(snap.status);
  };

  /**
   * 拉快照直到可交付（terminal status + 对应数据齐全）。
   *
   * 重试最多 3 次，每次间隔 1s。超过后抛错，由调用方走 done 事件兜底构造占位。
   * 任何一次网络失败直接抛（不在这里重试，交给调用方兜底）。
   */
  const fetchSnapshotUntilTerminal = async (): Promise<TaskSnapshot> => {
    for (let attempt = 0; attempt < SNAPSHOT_TERMINAL_MAX_ATTEMPTS; attempt++) {
      if (stopped) throw new Error('runAnalysisTask already stopped');
      const snap = await fetchTaskSnapshot(traceId, { signal: ac.signal });
      if (isSnapshotReadyToDeliver(snap)) return snap;
      if (attempt < SNAPSHOT_TERMINAL_MAX_ATTEMPTS - 1) {
        // sleep 也响应 abort：cleanup 后立即退出等待
        await new Promise<void>(resolve => {
          const t = setTimeout(resolve, SNAPSHOT_TERMINAL_RETRY_DELAY_MS);
          ac.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
    }
    throw new ApiError(
      0,
      ApiErrorCode.NETWORK_ERROR,
      '后端快照接口未在预期时间内同步完整数据'
    );
  };

  /**
   * done 事件兜底：拉快照失败（网络错 / 一直 running 超时）时，
   * 依据 done 事件本身给出最终反馈。task 已经 done 了，不让 finishError 把成功误报为失败。
   */
  const applyDoneEventFallback = (e: DoneEvent) => {
    const baseSnap = {
      trace_id: traceId,
      session_id: '',
      user_id: '',
      created_at: new Date().toISOString(),
      duration_ms: e.duration_ms,
    };
    if (e.status === 'ok') {
      finishOk({
        ...baseSnap,
        status: 'ok',
        result: {
          report_id: '',
          status: 'success',
          analysis_type: '',
          query: '',
          user_id: '',
          session_id: '',
          time_range: '',
          anomalies: [],
          supplier_kpis: [],
          summary: {},
          report_markdown:
            '✅ 分析已完成，但报告详情暂时无法加载。\n\n请稍后刷新页面查看结果。',
          error: null,
          completed_tasks: [],
          failed_tasks: [],
          created_at: new Date().toISOString(),
          duration_ms: e.duration_ms,
          trace_id: traceId,
        },
      });
    } else if (e.error) {
      finishOk({ ...baseSnap, status: e.status, error: e.error });
    } else {
      finishError(
        new ApiError(
          0,
          ApiErrorCode.NETWORK_ERROR,
          '任务失败但未提供错误信息'
        )
      );
    }
  };

  const handleEvent = (evt: AnalysisTaskEvent) => {
    if (stopped) return;
    // heartbeat 只代表连接存活，不代表任务有进展；不刷新 watchdog，
    // 否则后端只推 heartbeat（业务事件缺失的已知 bug）时前端会挂到 15 分钟全局超时。
    // 详见 docs/async_analyze_backend_issue.md。
    if (evt.type !== 'heartbeat') {
      lastEventAt = Date.now();
      hasReceivedBusinessEvent = true;
      // 真的收到业务事件说明 SSE 畅通，把连续失败计数器清零（totalFailures 不清 —— 累计指标不重置）
      consecutiveFailures = 0;
    }

    switch (evt.type) {
      case 'heartbeat':
      case 'status':
        return;

      case 'stage': {
        const e = evt as StageEvent;
        const text = e.label || stageText(e.name);
        if (text) {
          handlers.onStage(text);
          pushTimeline(text);
        }
        return;
      }

      case 'tool': {
        const e = evt as ToolEvent;
        const text = e.label || toolText(e.name);
        if (!text) return;
        const key = `tool:${e.name}`;
        if (e.action === 'start') {
          handlers.onStage(`正在${text}`);
          pushTimeline(`${text}进行中`, key);
        } else {
          updateTimeline(key, `${text}完成`, e.duration_ms ?? 0);
        }
        return;
      }

      case 'dag_task': {
        const e = evt as DagTaskEvent;
        const text = e.label || (toolText(e.task_name) ?? e.task_name);
        const key = `dag:${e.task_name}`;
        if (e.action === 'start') {
          handlers.onStage(`正在执行 ${text}`);
          pushTimeline(`${text} 执行中`, key);
        } else {
          updateTimeline(key, `${text} 执行完成`, e.duration_ms ?? 0);
        }
        return;
      }

      case 'report':
        return;

      case 'chunk': {
        handlers.onChunk?.(evt as ChunkEvent);
        return;
      }

      case 'done': {
        const e = evt as DoneEvent;
        // done 后主动拉快照拿完整 result。重试兜住后端快照状态滞后（SSE 已 done 但
        // 快照仍返回 running/result:null）；若仍失败，用 done 事件兜底避免误报失败。
        fetchSnapshotUntilTerminal()
          .then(snap => finishOk(snap))
          .catch(() => applyDoneEventFallback(e));
        return;
      }
    }
  };

  const parseAndDispatch = (raw: string) => {
    let evt: AnalysisTaskEvent;
    try {
      evt = JSON.parse(raw) as AnalysisTaskEvent;
    } catch {
      return;
    }
    handleEvent(evt);
  };

  // ---- 启动 SSE ----
  let connected = false;
  try {
    es = new EventSource(taskEventStreamUrl(traceId));
  } catch {
    startPolling();
    return cleanup;
  }

  const listen = (name: string) => {
    es?.addEventListener(name, (ev: MessageEvent) => parseAndDispatch(ev.data));
  };
  listen('status');
  listen('stage');
  listen('tool');
  listen('dag_task');
  listen('report');
  listen('heartbeat');
  listen('chunk');
  listen('done');

  es.onopen = () => {
    // 注意：这里只在"首次建连"时重置 lastEventAt。
    // 后端/网关经常在数十秒后主动关闭 SSE，EventSource 会自动重连并再次 onopen；
    // 如果每次都刷 lastEventAt，watchdog 的 30s 窗口会被无限滑动，永远不触发降级。
    // 叠加后端只推 heartbeat 不推业务事件的 bug（见 docs/async_analyze_backend_issue.md），
    // 就会出现"events 请求一直重连、前端永远分析中"的死循环。
    if (!connected) {
      lastEventAt = Date.now();
    }
    connected = true;
  };

  es.onerror = () => {
    if (stopped) return;
    // 建连失败：立即降级
    if (!connected) {
      startPolling();
      return;
    }
    // 已建连后的异常：计入失败熔断计数器。阈值内交给 EventSource 自动重连，超阈值 finishError。
    // 这是兜住"SSE 建连后反复断线重连"的关键：没有这个计数，EventSource 默认会无限重连，
    // Network 面板里 /events 请求会一直刷直到 15 分钟全局超时。
    if (recordFailure(new ApiError(0, ApiErrorCode.NETWORK_ERROR, 'SSE 连接中断'))) return;
  };

  // ---- 看门狗：冷启动 30s / 暖运行 180s 无事件则降级 ----
  // 冷窗口：从建连起 30s 内一个业务事件都没收到 → 后端大概率是 heartbeat-only bug，早降级；
  // 暖窗口：已经收到过业务事件 → 只在异常长时间静默（> 3min）时才降级，避免误杀
  // 正在推理的长任务（单次 LLM 调用 60-120s 很常见）。
  watchdog = setInterval(() => {
    if (stopped) return;
    if (exceededGlobalTimeout()) {
      finishError(new ApiError(0, ApiErrorCode.TIMEOUT, '任务超时，请重新发起'));
      return;
    }
    if (pollStartedAt !== null) return;
    const window = hasReceivedBusinessEvent
      ? WARM_NO_EVENT_TIMEOUT_MS
      : COLD_NO_EVENT_TIMEOUT_MS;
    if (Date.now() - lastEventAt > window) {
      startPolling();
    }
  }, NO_EVENT_CHECK_INTERVAL_MS);

  return cleanup;
}
