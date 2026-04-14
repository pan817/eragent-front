/**
 * 异步分析任务的事件流管理（纯函数层）。
 *
 * 职责：给一个 trace_id，开 SSE → 降级轮询 → 拉快照 → 把进度/终态推给回调。
 * 生命周期由 caller 管：调用方保存返回的 cleanup，卸载 / 切会话 / 重复调用时手动停。
 *
 * 决策点对照 docs/async_analyze_frontend.md 和设计讨论：
 *  - SSE：原生 EventSource + URL query（项目无鉴权，不传参即可）
 *  - 降级：建连失败立即降级；建连后 30s 无业务事件（heartbeat 不计入）降级；降级后关闭 SSE，仅轮询
 *  - 轮询：2s 间隔；累计 15 分钟超时 → error
 *  - done：拉一次快照后回调 onDone；快照失败也走 onError
 *  - 时间线：stage 事件 + tool/dag_task 的 end 事件入时间线；heartbeat/report 不入
 */
import type {
  AnalysisTaskEvent,
  AnalysisTimelineEntry,
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
const POLL_INTERVAL_MS = 2_000;
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

export interface AnalysisStreamHandlers {
  /** 阶段文案变更（气泡内单行展示） */
  onStage: (text: string) => void;
  /** 时间线追加一条（折叠面板内时序展示） */
  onTimelineAppend: (entry: AnalysisTimelineEntry) => void;
  /** 终态；snapshot.status 为 ok/error/aborted，result 与 error 二选一 */
  onDone: (snapshot: TaskSnapshot) => void;
  /** 流程里任何异常（建连失败未能降级、轮询超时、快照拉取失败等）。触发后不再 onDone */
  onError: (err: Error) => void;
  /** 流已从 SSE 降级为轮询。UI 可据此切换为"网络不稳定，正在查询结果..." */
  onDegraded?: () => void;
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
  // 失败熔断计数器：SSE onerror（已建连态）与轮询失败共用一套计数
  let consecutiveFailures = 0;
  let totalFailures = 0;

  const globalStartedAt = Date.now();

  const cleanup = () => {
    stopped = true;
    if (es) { es.close(); es = null; }
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  };

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
      const snap = await fetchTaskSnapshot(traceId);
      if (stopped) return;
      // 响应成功就算连续失败清零（status=ok/error/aborted 是业务终态，走 finishOk）
      consecutiveFailures = 0;
      if (snap.status === 'ok' || snap.status === 'error' || snap.status === 'aborted') {
        finishOk(snap);
        return;
      }
    } catch (err) {
      if (stopped) return;
      // 任何失败都计数（含 504/500 等 5xx、网络断、JSON 解析失败等）
      // 连续 MAX_CONSECUTIVE_FAILURES 次或累计 MAX_TOTAL_FAILURES 次 → 熔断，终止任务
      const e = err instanceof Error ? err : new Error(String(err));
      if (recordFailure(e)) return;
    }
    pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
  };

  const pushTimeline = (text: string, durationMs?: number) => {
    if (stopped) return;
    handlers.onTimelineAppend({
      ts: new Date().toISOString(),
      text,
      durationMs,
    });
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
        const text = stageText(e.name);
        if (text) {
          handlers.onStage(text);
          pushTimeline(text);
        }
        return;
      }

      case 'tool': {
        const e = evt as ToolEvent;
        const text = toolText(e.name);
        if (!text) return;
        if (e.action === 'start') {
          handlers.onStage(`正在${text}`);
        } else {
          pushTimeline(`${text}完成`, e.duration_ms);
        }
        return;
      }

      case 'dag_task': {
        const e = evt as DagTaskEvent;
        const text = toolText(e.task_name) ?? e.task_name;
        if (e.action === 'start') {
          handlers.onStage(`正在执行 ${text}`);
        } else {
          pushTimeline(`${text} 执行完成`, e.duration_ms);
        }
        return;
      }

      case 'report':
        return;

      case 'done': {
        const e = evt as DoneEvent;
        // done 后 EventSource 即将被服务端关闭；这里主动拉快照拿完整 result
        fetchTaskSnapshot(traceId)
          .then(snap => finishOk(snap))
          .catch(err => {
            // 快照拉不到的兜底：依据 done 事件本身给用户有效反馈，
            // 不把整个流程 finishError（done 已经说明了任务终态）
            const baseSnap = {
              trace_id: traceId,
              session_id: '',
              user_id: '',
              created_at: new Date().toISOString(),
              duration_ms: e.duration_ms,
            };
            if (e.status === 'ok') {
              // 任务成功但快照接口不可用：构造一个最小 result，气泡显示"分析完成但详情暂不可用"
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
              finishError(err);
            }
          });
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
