import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  type ApiChatSession,
  type ChatMessage,
  type FrontendSession,
  fromApiMessage,
  fromApiSession,
} from '../types/api';
import {
  clearAllSessions as apiClearAll,
  createSession as apiCreateSession,
  deleteSession as apiDeleteSession,
  getSession as apiGetSession,
  listSessions as apiListSessions,
  searchSessions as apiSearchSessions,
  updateSessionTitle as apiUpdateSessionTitle,
} from '../services/chatSessions';

export type ChatSession = FrontendSession;

// 兼容旧名：ChatWindow / Sidebar 仍然拿 ChatSession 用 messages 字段
// 所以保证 FrontendSession 里有 messages

interface LocalPersistedState {
  sessions: ChatSession[];
  currentId: string;
}

const LOCAL_STORAGE_KEY = 'erp-agent-chat-sessions-v1';
const MAX_SESSIONS = 50;
const TITLE_MAX = 24;

import { genId } from '../utils/id';
import { safeSetItem } from '../utils/safeStorage';
import { showToastOnce } from '../utils/toast';

const nowMs = () => Date.now();

const deriveTitle = (messages: ChatMessage[]): string => {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return '新对话';
  const text = firstUser.content.trim().replace(/\s+/g, ' ');
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX)}…` : text || '新对话';
};

const TEMP_PREFIX = 'temp-';
const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

const makeEmptySession = (opts: { temp?: boolean } = {}): ChatSession => {
  const t = nowMs();
  const id = opts.temp ? `${TEMP_PREFIX}${genId()}` : genId();
  return {
    id,
    title: '新对话',
    titleAuto: true,
    messageCount: 0,
    lastMessagePreview: null,
    createdAt: t,
    updatedAt: t,
    messages: [],
  };
};

// ============================================
// localStorage（guest 模式 / 降级）
// ============================================

const loadLocal = (): LocalPersistedState => {
  if (typeof window === 'undefined') {
    const s = makeEmptySession();
    return { sessions: [s], currentId: s.id };
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    // 隐私模式 / 读盘失败：直接回退到空会话，safeStorage 不读所以这里手动 try
    const s = makeEmptySession();
    return { sessions: [s], currentId: s.id };
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        sessions: Array<Partial<ChatSession> & { messages?: unknown[] }>;
        currentId: string;
      };
      if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        const sessions: ChatSession[] = parsed.sessions.map(s => ({
          id: s.id ?? genId(),
          title: s.title ?? '新对话',
          titleAuto: s.titleAuto ?? true,
          messageCount: s.messageCount ?? (Array.isArray(s.messages) ? s.messages.length : 0),
          lastMessagePreview: s.lastMessagePreview ?? null,
          createdAt: typeof s.createdAt === 'number' ? s.createdAt : nowMs(),
          updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : nowMs(),
          messages: Array.isArray(s.messages)
            ? (s.messages as Array<ChatMessage & { timestamp: string | Date }>).map(m => ({
                ...m,
                timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
              }))
            : [],
        }));
        const currentId = sessions.find(s => s.id === parsed.currentId)?.id ?? sessions[0].id;
        return { sessions, currentId };
      }
    } catch (err) {
      // 损坏的数据 (磁盘故障 / 其它 tab 并发写坏 / 手动改 storage) —— 直接丢弃会让
      // guest 用户看到"全部历史消失"，没法追责也没法恢复。这里做一次性备份：
      // 把原 raw 挪到带时间戳的 key，留给用户/支持人员可取。toast 告知发生了什么。
      const backupKey = `${LOCAL_STORAGE_KEY}-corrupted-${Date.now()}`;
      try {
        localStorage.setItem(backupKey, raw);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        // 备份写失败（quota 等）也不阻塞流程
      }
      console.warn('[useChatSessions] localStorage 解析失败，已备份到', backupKey, err);
      showToastOnce(
        'chat-sessions-corrupted',
        '本地会话数据损坏，已备份并重置。若需恢复可联系支持。',
        { level: 'warn', duration: 6000 }
      );
    }
  }
  const s = makeEmptySession();
  return { sessions: [s], currentId: s.id };
};

const saveLocal = (state: LocalPersistedState) => {
  if (typeof window === 'undefined') return;
  // safeSetItem 内部已处理配额/隐私模式，并用 showToastOnce 首次失败时告知用户
  safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
};

// ============================================
// Hook 返回值
// ============================================

export interface UseChatSessionsReturn {
  sessions: ChatSession[];
  currentId: string;
  currentSession: ChatSession;
  messages: ChatMessage[];
  loading: boolean;
  detailLoading: boolean;
  isGuestMode: boolean;
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]), targetSessionId?: string) => void;
  newChat: () => void;
  switchTo: (id: string) => void;
  deleteSession: (id: string) => void;
  clearAll: () => void;
  search: string;
  setSearch: (s: string) => void;
  filteredSessions: ChatSession[];
  /** 发消息前调用：若当前是 temp session 则同步创建到后端，返回真实 sessionId */
  ensureRemoteSession: () => Promise<string>;
  /** /analyze 返回后调用：用 res.session 刷新本地 session 元信息 */
  commitSessionFromAnalyze: (apiSession: ApiChatSession) => void;
  /** 重命名会话标题（乐观更新 + 调后端 PATCH）；设 titleAuto=false 防止后端自动覆盖 */
  renameSession: (id: string, newTitle: string) => void;
}

// ============================================
// 主 hook
// ============================================

export function useChatSessions(userId: string | null): UseChatSessionsReturn {
  // 登录态跑 online，未登录 / 失败降级 guest
  const [isGuestMode, setIsGuestMode] = useState(() => userId === null);
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (userId === null) {
      const local = loadLocal();
      return local.sessions;
    }
    return [makeEmptySession({ temp: true })];
  });
  const [currentId, setCurrentId] = useState<string>(() => {
    if (userId === null) {
      return loadLocal().currentId;
    }
    return sessions[0]?.id ?? genId();
  });
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearchState] = useState('');
  const [serverSearchResults, setServerSearchResults] = useState<ChatSession[] | null>(null);

  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const detailLoadedRef = useRef<Set<string>>(new Set());
  // 并发保护：同一个 temp id 多次调用 ensureRemoteSession 复用同一个 promise
  const pendingEnsureRef = useRef<Map<string, Promise<string>>>(new Map());
  /**
   * switchTo 并发保护：每个 session 的 GET 请求持有一个 AbortController；
   * 再次 switchTo 同一 / 其它 session 时 abort 所有未完成请求，避免旧响应覆写当前状态
   * （A→B→C 快速切换时 B 的响应晚到，`setSessions(... id === B ? s : x)` 会把用户已修改的
   * B 本地状态（如刚发送的 pending 消息）用服务端快照覆盖掉）。
   */
  const detailLoadingControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 组件卸载时 abort 所有在途 getSession，防止回调里 setSessions 落到已卸载 hook
  useEffect(() => {
    const controllers = detailLoadingControllersRef.current;
    return () => {
      controllers.forEach(c => c.abort());
      controllers.clear();
    };
  }, []);

  // guest 模式下把 state 同步到 localStorage
  useEffect(() => {
    if (!isGuestMode) return;
    saveLocal({ sessions, currentId });
  }, [isGuestMode, sessions, currentId]);

  // ============================================
  // 初始化 / userId 变化 → 重新拉列表
  // ============================================
  useEffect(() => {
    if (userId === null) {
      // 登出：回到 guest
      setIsGuestMode(true);
      const local = loadLocal();
      setSessions(local.sessions);
      setCurrentId(local.currentId);
      detailLoadedRef.current = new Set();
      return;
    }

    // 登录或切换用户：拉后端列表
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      try {
        const resp = await apiListSessions(userId, { limit: MAX_SESSIONS });
        if (cancelled) return;
        const remoteSessions = resp.sessions.map(s => fromApiSession(s));
        if (remoteSessions.length === 0) {
          // 空账号：本地造一个 temp 会话，发第一条消息时再 POST /sessions
          const empty = makeEmptySession({ temp: true });
          setSessions([empty]);
          setCurrentId(empty.id);
        } else {
          const firstId = remoteSessions[0].id;
          // 立即加载第一个会话的消息，避免侧边栏选中但主区域显示欢迎页
          try {
            const detail = await apiGetSession(userId, firstId);
            if (cancelled) return;
            const msgs = detail.messages.map(fromApiMessage).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            remoteSessions[0] = fromApiSession(detail.session, msgs);
            detailLoadedRef.current = new Set([firstId]);
          } catch {
            // 消息加载失败不阻塞，降级为空消息（显示欢迎页）
            detailLoadedRef.current = new Set();
          }
          setSessions(remoteSessions);
          setCurrentId(firstId);
        }
        setIsGuestMode(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[useChatSessions] list failed, falling back to guest:', err);
        setIsGuestMode(true);
        const local = loadLocal();
        setSessions(local.sessions);
        setCurrentId(local.currentId);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const currentSession = useMemo(
    () => sessions.find(s => s.id === currentId) ?? sessions[0] ?? makeEmptySession(),
    [sessions, currentId]
  );

  // ============================================
  // setMessages：纯本地，供乐观渲染使用
  // ============================================
  const setMessages = useCallback<UseChatSessionsReturn['setMessages']>((updater, targetSessionId?) => {
    setSessions(prev => {
      const cid = targetSessionId ?? currentIdRef.current;
      const current = prev.find(s => s.id === cid);
      if (!current) return prev;
      const nextMessages =
        typeof updater === 'function' ? updater(current.messages) : updater;
      const updated: ChatSession = {
        ...current,
        messages: nextMessages,
        messageCount: nextMessages.length,
        title: current.titleAuto ? deriveTitle(nextMessages) : current.title,
        lastMessagePreview:
          nextMessages.length > 0
            ? nextMessages[nextMessages.length - 1].content.slice(0, 60)
            : null,
        updatedAt: nowMs(),
      };
      return prev.map(s => (s.id === cid ? updated : s));
    });
  }, []);

  // ============================================
  // newChat
  // ============================================
  const newChat = useCallback(() => {
    // 当前会话为空 → 停留在当前
    const current = sessions.find(s => s.id === currentId);
    if (current && current.messages.length === 0 && current.messageCount === 0) {
      return;
    }

    if (isGuestMode || userId === null) {
      const fresh = makeEmptySession();
      setSessions(prev => [fresh, ...prev].slice(0, MAX_SESSIONS));
      setCurrentId(fresh.id);
      return;
    }

    // 在线模式：先本地建 temp，发第一条消息时由 ensureRemoteSession 调 POST
    const tempSession = makeEmptySession({ temp: true });
    setSessions(prev => [tempSession, ...prev].slice(0, MAX_SESSIONS));
    setCurrentId(tempSession.id);
  }, [sessions, currentId, isGuestMode, userId]);

  // ============================================
  // switchTo：懒加载消息
  // ============================================
  const switchTo = useCallback(
    (id: string) => {
      setSessions(prev => {
        if (!prev.some(s => s.id === id)) return prev;
        // 清理其他空会话
        return prev.filter(s => s.id === id || s.messages.length > 0 || s.messageCount > 0);
      });
      setCurrentId(id);

      if (isGuestMode || userId === null) return;
      if (isTempId(id)) return;
      if (detailLoadedRef.current.has(id)) return;

      const target = sessionsRef.current.find(s => s.id === id);
      if (target && target.messages.length > 0) {
        detailLoadedRef.current.add(id);
        return;
      }

      setDetailLoading(true);
      // 先 abort 此 session 上一轮未完成的 load（若有），避免两次响应相互覆盖
      detailLoadingControllersRef.current.get(id)?.abort();
      const ac = new AbortController();
      detailLoadingControllersRef.current.set(id, ac);
      apiGetSession(userId, id, { signal: ac.signal })
        .then(resp => {
          if (ac.signal.aborted) return;
          const msgs = resp.messages.map(fromApiMessage).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          const s = fromApiSession(resp.session, msgs);
          setSessions(prev => prev.map(x => (x.id === id ? s : x)));
          detailLoadedRef.current.add(id);
        })
        .catch(err => {
          // abort 是有意为之的取消，不打错误日志也不进负 cache
          if (err instanceof ApiError && err.code === 'ABORTED') return;
          console.error('[useChatSessions] getSession failed:', err);
          // 失败也标记为 "已尝试"，避免每次切回这个 session 都重新请求（请求风暴）。
          // 用户要重试只能靠其它路径（刷新/重新登录），这是有意的保守策略。
          detailLoadedRef.current.add(id);
        })
        .finally(() => {
          if (detailLoadingControllersRef.current.get(id) === ac) {
            detailLoadingControllersRef.current.delete(id);
          }
          if (!ac.signal.aborted) setDetailLoading(false);
        });
    },
    [isGuestMode, userId]
  );

  // ============================================
  // deleteSession
  // ============================================
  const deleteSession = useCallback(
    (id: string) => {
      // 快照用于回滚
      let snapshot: ChatSession[] | null = null;
      let prevCurrentId: string | null = null;

      // 乐观移除
      const tempPlaceholder = isGuestMode ? makeEmptySession() : makeEmptySession({ temp: true });
      setSessions(prev => {
        snapshot = prev;
        const remaining = prev.filter(s => s.id !== id);
        if (remaining.length === 0) {
          return [tempPlaceholder];
        }
        return remaining;
      });
      setCurrentId(prev => {
        prevCurrentId = prev;
        if (prev !== id) return prev;
        const remaining = sessionsRef.current.filter(s => s.id !== id);
        return remaining[0]?.id ?? tempPlaceholder.id;
      });

      if (isGuestMode || userId === null) return;
      if (isTempId(id)) return;

      apiDeleteSession(userId, id).catch(err => {
        console.error('[useChatSessions] deleteSession failed, rolling back:', err);
        if (snapshot) setSessions(snapshot);
        if (prevCurrentId) setCurrentId(prevCurrentId);
      });
    },
    [isGuestMode, userId]
  );

  // ============================================
  // clearAll
  // ============================================
  const clearAll = useCallback(() => {
    let snapshot: ChatSession[] | null = null;
    let prevCurrentId: string | null = null;
    const prevDetailLoaded = new Set(detailLoadedRef.current);

    const empty = isGuestMode ? makeEmptySession() : makeEmptySession({ temp: true });
    setSessions(prev => { snapshot = prev; return [empty]; });
    setCurrentId(prev => { prevCurrentId = prev; return empty.id; });
    detailLoadedRef.current = new Set();

    if (isGuestMode || userId === null) return;
    apiClearAll(userId).catch(err => {
      console.error('[useChatSessions] clearAll failed, rolling back:', err);
      if (snapshot) setSessions(snapshot);
      if (prevCurrentId) setCurrentId(prevCurrentId);
      detailLoadedRef.current = prevDetailLoaded;
    });
  }, [isGuestMode, userId]);

  // ============================================
  // ensureRemoteSession：发消息前确保 session 在后端存在
  // 当前 currentId 是 temp 时调 POST /sessions 拿真 id 并替换；
  // 否则直接返回 currentId。
  // ============================================
  const ensureRemoteSession = useCallback(async (): Promise<string> => {
    // guest 模式不联网，原样返回（后端 /analyze 在 guest 模式下也不会被调用 auto_persist）
    if (isGuestMode || userId === null) return currentId;
    if (!isTempId(currentId)) return currentId;

    // 复用进行中的 promise，避免并发狂点重复创建
    const existing = pendingEnsureRef.current.get(currentId);
    if (existing) return existing;

    const tempId = currentId;
    const promise = (async () => {
      try {
        const resp = await apiCreateSession(userId, { idempotencyKey: tempId });
        const real = fromApiSession(resp.session);
        // 原子替换：sessions 数组里 temp 那条改成 real，currentId 也改成 real.id
        setSessions(prev =>
          prev.map(s =>
            s.id === tempId
              ? {
                  ...real,
                  // 保留本地已有的乐观消息和元信息
                  messages: s.messages,
                  messageCount: Math.max(real.messageCount, s.messageCount),
                  title: s.titleAuto && s.title !== '新对话' ? s.title : real.title,
                }
              : s
          )
        );
        setCurrentId(prevId => (prevId === tempId ? real.id : prevId));
        // 立即同步 ref，确保后续 setMessages 能找到正确的 session
        currentIdRef.current = real.id;
        detailLoadedRef.current.add(real.id);
        return real.id;
      } finally {
        pendingEnsureRef.current.delete(tempId);
      }
    })();

    pendingEnsureRef.current.set(tempId, promise);
    return promise;
  }, [currentId, isGuestMode, userId]);

  // ============================================
  // commitSessionFromAnalyze：用 /analyze 返回的 session 元信息刷新本地
  // ============================================
  const commitSessionFromAnalyze = useCallback((apiSession: ApiChatSession) => {
    const updated = fromApiSession(apiSession);
    setSessions(prev => {
      const found = prev.find(s => s.id === updated.id);
      if (!found) {
        // 不在列表里：插入到首位（极少见，例如后端在 analyze 内部新建了 session）
        return [{ ...updated, messages: [] }, ...prev].slice(0, MAX_SESSIONS);
      }
      const merged: ChatSession = {
        ...updated,
        messages: found.messages, // 保留前端已经渲染的乐观消息
      };
      return prev.map(s => (s.id === updated.id ? merged : s));
    });
    detailLoadedRef.current.add(updated.id);
  }, []);

  // ============================================
  // renameSession
  // ============================================
  const renameSession = useCallback(
    (id: string, newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      // 快照旧标题用于回滚
      let oldTitle: string | null = null;
      setSessions(prev =>
        prev.map(s => {
          if (s.id === id) {
            oldTitle = s.title;
            return { ...s, title: trimmed, titleAuto: false };
          }
          return s;
        })
      );
      if (isGuestMode || userId === null) return;
      if (isTempId(id)) return;
      apiUpdateSessionTitle(userId, id, trimmed).catch(err => {
        console.error('[useChatSessions] renameSession failed, rolling back:', err);
        if (oldTitle !== null) {
          setSessions(prev =>
            prev.map(s => (s.id === id ? { ...s, title: oldTitle! } : s))
          );
        }
      });
    },
    [isGuestMode, userId]
  );

  // ============================================
  // search（guest 本地过滤 / online debounce 调接口）
  // ============================================
  const setSearch = useCallback((s: string) => {
    setSearchState(s);
  }, []);

  useEffect(() => {
    if (isGuestMode || userId === null) {
      setServerSearchResults(null);
      return;
    }
    const q = search.trim();
    if (!q) {
      setServerSearchResults(null);
      return;
    }
    // stale 标记：effect 清理时置 true，丢弃已过期的响应
    let stale = false;
    const handle = window.setTimeout(() => {
      apiSearchSessions(userId, q, { limit: 30 })
        .then(resp => {
          if (stale) return;
          setServerSearchResults(resp.sessions.map(s => fromApiSession(s)));
        })
        .catch(err => {
          if (stale) return;
          console.error('[useChatSessions] search failed, falling back to local filter:', err);
          setServerSearchResults(null);
        });
    }, 300);
    return () => { stale = true; window.clearTimeout(handle); };
  }, [search, isGuestMode, userId]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  );

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedSessions;

    if (isGuestMode) {
      return sortedSessions.filter(s => {
        if (s.title.toLowerCase().includes(q)) return true;
        return s.messages.some(m => m.content.toLowerCase().includes(q));
      });
    }
    // online：优先用 server 结果；未就绪前用本地 title 匹配作为占位
    if (serverSearchResults !== null) return serverSearchResults;
    return sortedSessions.filter(s => s.title.toLowerCase().includes(q));
  }, [sortedSessions, search, isGuestMode, serverSearchResults]);

  return {
    sessions,
    currentId,
    currentSession,
    messages: currentSession.messages,
    loading,
    detailLoading,
    isGuestMode,
    setMessages,
    newChat,
    switchTo,
    deleteSession,
    clearAll,
    search,
    setSearch,
    filteredSessions,
    ensureRemoteSession,
    commitSessionFromAnalyze,
    renameSession,
  };
}

// 额外导出（不改变原有 ApiError import 路径）
export { ApiError };
