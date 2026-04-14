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

const NO_EVENT_TIMEOUT_MS = 30_000;
const NO_EVENT_CHECK_INTERVAL_MS = 5_000;
const POLL_INTERVAL_MS = 2_000;
const GLOBAL_TIMEOUT_MS = 15 * 60 * 1000;

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
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollStartedAt: number | null = null;

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
      if (snap.status === 'ok' || snap.status === 'error' || snap.status === 'aborted') {
        finishOk(snap);
        return;
      }
    } catch (err) {
      if (stopped) return;
      // 单次轮询失败不立即 fail；留给下次重试或全局超时
      // 但连网络不通的错误直接 fail 避免空转
      if (err instanceof ApiError && err.isNetworkError()) {
        finishError(err);
        return;
      }
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
    connected = true;
    lastEventAt = Date.now();
  };

  es.onerror = () => {
    if (stopped) return;
    // 建连失败：立即降级；已建连后异常先交给 EventSource 自动重连
    if (!connected) {
      startPolling();
    }
  };

  // ---- 30s 无事件看门狗 ----
  watchdog = setInterval(() => {
    if (stopped) return;
    if (exceededGlobalTimeout()) {
      finishError(new ApiError(0, ApiErrorCode.TIMEOUT, '任务超时，请重新发起'));
      return;
    }
    if (Date.now() - lastEventAt > NO_EVENT_TIMEOUT_MS && pollStartedAt === null) {
      startPolling();
    }
  }, NO_EVENT_CHECK_INTERVAL_MS);

  return cleanup;
}
