/**
 * 对 runAnalysisTask 的薄 React 封装：按 traceId 管理多个并行流，
 * 组件卸载时全部 cleanup，同一个 traceId 重复 start 时先关旧的。
 *
 * Why: pure function 不知道 React 生命周期；放到组件 ref 里维护 active map 最简单。
 * How: useMessageSending 发消息拿到 ack 后调 start；ChatWindow 刷新恢复扫消息批量 start。
 */
import { useCallback, useEffect, useRef } from 'react';
import { runAnalysisTask, type AnalysisStreamHandlers } from '../services/analysisStream';

export interface UseAnalysisStreamsReturn {
  start: (traceId: string, handlers: AnalysisStreamHandlers) => void;
  stop: (traceId: string) => void;
  stopAll: () => void;
  isActive: (traceId: string) => boolean;
  /** 当前活跃 trace_id 列表，供调用方做"不在此列表则停"的集合清理 */
  activeIds: () => string[];
}

export function useAnalysisStreams(): UseAnalysisStreamsReturn {
  const activeRef = useRef(new Map<string, () => void>());

  useEffect(() => {
    const active = activeRef.current;
    return () => {
      active.forEach(fn => fn());
      active.clear();
    };
  }, []);

  const start = useCallback((traceId: string, handlers: AnalysisStreamHandlers) => {
    activeRef.current.get(traceId)?.();

    const wrap: AnalysisStreamHandlers = {
      onStage: handlers.onStage,
      onTimelineAppend: handlers.onTimelineAppend,
      onDegraded: handlers.onDegraded,
      onDone: snap => {
        activeRef.current.delete(traceId);
        handlers.onDone(snap);
      },
      onError: err => {
        activeRef.current.delete(traceId);
        handlers.onError(err);
      },
    };

    const cleanup = runAnalysisTask(traceId, wrap);
    activeRef.current.set(traceId, cleanup);
  }, []);

  const stop = useCallback((traceId: string) => {
    activeRef.current.get(traceId)?.();
    activeRef.current.delete(traceId);
  }, []);

  const stopAll = useCallback(() => {
    activeRef.current.forEach(fn => fn());
    activeRef.current.clear();
  }, []);

  const isActive = useCallback((traceId: string) => activeRef.current.has(traceId), []);

  const activeIds = useCallback(() => Array.from(activeRef.current.keys()), []);

  return { start, stop, stopAll, isActive, activeIds };
}
