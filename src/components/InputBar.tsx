import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import SlashCommandPanel, { getFilteredPrompts } from './SlashCommandPanel';
import Popover from './Popover';
import type { ExamplePrompt } from '../data/examplePrompts';
import { formatMs } from '../utils/format';
import './InputBar.css';

export type AnalystRole = 'general' | 'procurement' | 'finance' | 'supply';
export type OutputMode = 'detailed' | 'brief' | 'table';
export type TimeRange = '' | '7d' | '30d' | '90d' | 'this_month' | 'last_month';

export interface SendOptions {
  role: AnalystRole;
  outputMode: OutputMode;
  timeRange: TimeRange;
}

interface Props {
  onSend: (query: string, options: SendOptions) => void;
  disabled: boolean;
  lastDurationMs?: number;
  /** 递增触发：每次变化会把 draftText 注入输入框并聚焦 */
  draftNonce?: number;
  draftText?: string;
  onOpenExamples?: () => void;
  onOpenTips?: () => void;
  /** 当前 session 有进行中的分析时传入。disabled=true 且 onStop 存在 → 发送按钮变停止按钮。 */
  onStop?: () => void;
}

interface RoleDef {
  key: AnalystRole;
  label: string;
  icon: string;
  hint: string;
}

const ROLES: RoleDef[] = [
  { key: 'general', label: '通用分析', icon: '🧭', hint: '不限定业务视角，综合判断' },
  { key: 'procurement', label: '采购分析师', icon: '🛒', hint: '聚焦供应商、订单、价格偏差' },
  { key: 'finance', label: '财务分析师', icon: '💰', hint: '聚焦金额、成本、三路匹配' },
  { key: 'supply', label: '供应链主管', icon: '📦', hint: '聚焦交付、库存、风险异常' },
];

const OPTIONS_STORAGE_KEY = 'erp-agent-input-options-v1';
const SHORTCUT_STORAGE_KEY = 'erp-agent-input-shortcut-v1';
/** 消息行数 ≥ 此值时启用"长消息软保护"：裸 Enter 插换行而非发送 */
const SOFT_PROTECT_MIN_LINES = 3;
/** 输入最大字符数（粘贴长文本时截断并提示） */
const INPUT_MAX_LENGTH = 4000;

type SendShortcut = 'enter' | 'mod-enter';

const DEFAULT_OPTIONS: SendOptions = {
  role: 'general',
  outputMode: 'detailed',
  timeRange: '',
};

interface OutputModeDef {
  key: OutputMode;
  label: string;
  icon: string;
}

const OUTPUT_MODES: OutputModeDef[] = [
  { key: 'detailed', label: '详细报告', icon: '📄' },
  { key: 'brief', label: '简报摘要', icon: '📋' },
  { key: 'table', label: '数据表格', icon: '📊' },
];

interface TimeRangeDef {
  key: TimeRange;
  label: string;
}

const TIME_RANGES: TimeRangeDef[] = [
  { key: '', label: '不限时间' },
  { key: '7d', label: '最近 7 天' },
  { key: '30d', label: '最近 30 天' },
  { key: '90d', label: '最近 90 天' },
  { key: 'this_month', label: '本月' },
  { key: 'last_month', label: '上月' },
];

const loadOptions = (): SendOptions => {
  if (typeof window === 'undefined') return DEFAULT_OPTIONS;
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SendOptions>;
      return { ...DEFAULT_OPTIONS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_OPTIONS;
};

const loadShortcut = (): SendShortcut => {
  if (typeof window === 'undefined') return 'enter';
  try {
    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
    if (raw === 'enter' || raw === 'mod-enter') return raw;
  } catch {
    // ignore
  }
  return 'enter';
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
const MOD_LABEL = isMac ? '⌘' : 'Ctrl';

export default function InputBar({
  onSend,
  disabled,
  lastDurationMs,
  draftNonce,
  draftText,
  onOpenExamples,
  onOpenTips,
  onStop,
}: Props) {
  const [input, setInput] = useState('');
  const [composing, setComposing] = useState(false);
  const [options, setOptions] = useState<SendOptions>(loadOptions);
  const [sendShortcut, setSendShortcut] = useState<SendShortcut>(loadShortcut);
  const [justSwitched, setJustSwitched] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [roleIdx, setRoleIdx] = useState(-1);
  const [outputIdx, setOutputIdx] = useState(-1);
  const [timeIdx, setTimeIdx] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);
  const outputMenuRef = useRef<HTMLDivElement>(null);
  const timeMenuRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0); // 追踪 requestAnimationFrame，卸载时取消

  // "/" 斜杠命令：检测输���是否以 "/" 开头
  const slashFilter = useMemo(() => {
    if (!slashOpen) return '';
    // 输入 "/xxx" → 过滤关键词为 "xxx"
    return input.startsWith('/') ? input.slice(1) : '';
  }, [slashOpen, input]);

  const slashFiltered = useMemo(
    () => slashOpen ? getFilteredPrompts(slashFilter) : [],
    [slashOpen, slashFilter]
  );

  // 当过滤结果变化时重置索引
  // TODO: 改为 useMemo 派生或放在 slashFilter 的 setter 里，避免 effect setState
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlashIndex(0);
  }, [slashFilter]);

  // 卸载时取消 rAF
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleSlashPick = useCallback((p: ExamplePrompt) => {
    setSlashOpen(false);
    if (p.editable) {
      // 含参数：填入输入框，等用户修改后再发送
      setInput(p.query);
      rafRef.current = requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 180) + 'px';
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    } else {
      // 直接发送
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      onSend(p.query, options);
    }
  }, [onSend, options]);

  // 外部注入草稿（例如从示例问题库填入）
  // TODO: 重构为父组件事件回调，避免 effect 内 setState
  useEffect(() => {
    if (draftNonce === undefined || draftText === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInput(draftText);
    // 等待下一帧 textarea 存在并可操作
    rafRef.current = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 180) + 'px';
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [draftNonce, draftText]);

  useEffect(() => {
    try {
      localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
    } catch {
      // ignore
    }
  }, [options]);

  useEffect(() => {
    try {
      localStorage.setItem(SHORTCUT_STORAGE_KEY, sendShortcut);
    } catch {
      // ignore
    }
  }, [sendShortcut]);

  // Cmd/Ctrl + K 聚焦输入框
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 外部点击 / Esc 关闭由 Popover 内部处理

  const currentRole = useMemo(
    () => ROLES.find(r => r.key === options.role) ?? ROLES[0],
    [options.role]
  );

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, options);
    setInput('');
    setSlashOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const lineCount = useMemo(() => input.split('\n').length, [input]);
  const softProtected = sendShortcut === 'enter' && lineCount >= SOFT_PROTECT_MIN_LINES;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composing：中文输入法确认候选词时也会触发，必须忽略
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    // "/" 斜杠面板打开时，拦截方向键、Enter、Esc
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(i => (i + 1) % Math.max(slashFiltered.length, 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(i => (i - 1 + Math.max(slashFiltered.length, 1)) % Math.max(slashFiltered.length, 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (slashFiltered.length > 0) {
          handleSlashPick(slashFiltered[slashIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
      // Tab 也可以确认选中
      if (e.key === 'Tab') {
        e.preventDefault();
        if (slashFiltered.length > 0) {
          handleSlashPick(slashFiltered[slashIndex]);
        }
        return;
      }
      // 其他键（字母、退格等）继续编辑，面板保持打开
      return;
    }

    if (e.key !== 'Enter') return;
    // Shift+Enter 永远插入换行
    if (e.shiftKey) return;

    const modKey = e.metaKey || e.ctrlKey;

    if (sendShortcut === 'mod-enter') {
      // 模式 B：只有 mod+Enter 发送，裸 Enter 插换行
      if (modKey) {
        e.preventDefault();
        handleSend();
      }
      return;
    }

    // 模式 A（默认）：Enter 发送，但长消息（≥3 行）软保护
    if (softProtected && !modKey) {
      // 让 Enter 正常插入换行（不 preventDefault）
      return;
    }

    e.preventDefault();
    handleSend();
  };

  const toggleSendShortcut = () => {
    setSendShortcut(prev => (prev === 'enter' ? 'mod-enter' : 'enter'));
    setJustSwitched(true);
    window.setTimeout(() => setJustSwitched(false), 1800);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let val = e.target.value;
    if (val.length > INPUT_MAX_LENGTH) {
      val = val.slice(0, INPUT_MAX_LENGTH);
    }
    setInput(val);
    const el = e.target;
    // IME 合成期间跳过 autosize，避免中文输入途中布局抖动
    if (!composing) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 180) + 'px';
    }

    // "/" 斜杠命令检测：仅在行首输入 "/" 时触发
    if (val.startsWith('/') && !val.includes('\n')) {
      setSlashOpen(true);
    } else {
      setSlashOpen(false);
    }
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    setComposing(false);
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  const handleNewPrompt = () => {
    setInput('');
    setSlashOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const canSend = !disabled && input.trim().length > 0;
  const charCount = input.length;

  return (
    <div className="input-bar">
      <div className={`input-wrapper ${disabled ? 'is-disabled' : ''}`}>
        {slashOpen && (
          <SlashCommandPanel
            filter={slashFilter}
            activeIndex={slashIndex}
            onPick={handleSlashPick}
          />
        )}
        <div className="input-toolbar">
          <div className="input-toolbar-left">
            <div className="input-role" ref={roleMenuRef}>
              <button
                type="button"
                className="input-role-trigger"
                onClick={() => { setRoleMenuOpen(v => !v); setRoleIdx(ROLES.findIndex(r => r.key === options.role)); }}
                onKeyDown={e => {
                  if (!roleMenuOpen) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setRoleIdx(i => (i + 1) % ROLES.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setRoleIdx(i => (i - 1 + ROLES.length) % ROLES.length); }
                  else if (e.key === 'Enter' && roleIdx >= 0) { e.preventDefault(); setOptions(o => ({ ...o, role: ROLES[roleIdx].key })); setRoleMenuOpen(false); }
                  else if (e.key === 'Escape') { e.preventDefault(); setRoleMenuOpen(false); }
                }}
                aria-haspopup="listbox"
                aria-expanded={roleMenuOpen}
              >
                <span className="input-role-icon">{currentRole.icon}</span>
                <span className="input-role-label">{currentRole.label}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <Popover
                open={roleMenuOpen}
                anchorRef={roleMenuRef}
                onClose={() => setRoleMenuOpen(false)}
                className="input-role-menu"
              >
                <div role="listbox">
                  {ROLES.map(r => (
                    <button
                      key={r.key}
                      type="button"
                      role="option"
                      aria-selected={r.key === options.role}
                      className={`input-role-item ${r.key === options.role ? 'is-active' : ''} ${roleIdx === ROLES.indexOf(r) ? 'is-focused' : ''}`}
                      onClick={() => {
                        setOptions(o => ({ ...o, role: r.key }));
                        setRoleMenuOpen(false);
                      }}
                    >
                      <span className="input-role-item-icon">{r.icon}</span>
                      <div className="input-role-item-text">
                        <div className="input-role-item-label">{r.label}</div>
                        <div className="input-role-item-hint">{r.hint}</div>
                      </div>
                      {r.key === options.role && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </Popover>
            </div>

            <div className="input-role" ref={outputMenuRef}>
              <button
                type="button"
                className="input-role-trigger"
                onClick={() => { setOutputMenuOpen(v => !v); setOutputIdx(OUTPUT_MODES.findIndex(m => m.key === options.outputMode)); }}
                onKeyDown={e => {
                  if (!outputMenuOpen) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setOutputIdx(i => (i + 1) % OUTPUT_MODES.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setOutputIdx(i => (i - 1 + OUTPUT_MODES.length) % OUTPUT_MODES.length); }
                  else if (e.key === 'Enter' && outputIdx >= 0) { e.preventDefault(); setOptions(o => ({ ...o, outputMode: OUTPUT_MODES[outputIdx].key })); setOutputMenuOpen(false); }
                  else if (e.key === 'Escape') { e.preventDefault(); setOutputMenuOpen(false); }
                }}
                aria-haspopup="listbox"
                aria-expanded={outputMenuOpen}
                title="选择输出格式"
              >
                <span className="input-role-icon">
                  {OUTPUT_MODES.find(m => m.key === options.outputMode)?.icon}
                </span>
                <span className="input-role-label">
                  {OUTPUT_MODES.find(m => m.key === options.outputMode)?.label}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <Popover
                open={outputMenuOpen}
                anchorRef={outputMenuRef}
                onClose={() => setOutputMenuOpen(false)}
                className="input-role-menu"
              >
                <div role="listbox">
                  {OUTPUT_MODES.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      role="option"
                      aria-selected={m.key === options.outputMode}
                      className={`input-role-item ${m.key === options.outputMode ? 'is-active' : ''} ${outputIdx === OUTPUT_MODES.indexOf(m) ? 'is-focused' : ''}`}
                      onClick={() => {
                        setOptions(o => ({ ...o, outputMode: m.key }));
                        setOutputMenuOpen(false);
                      }}
                    >
                      <span className="input-role-item-icon">{m.icon}</span>
                      <div className="input-role-item-text">
                        <div className="input-role-item-label">{m.label}</div>
                      </div>
                      {m.key === options.outputMode && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </Popover>
            </div>

            <div className="input-role" ref={timeMenuRef}>
              <button
                type="button"
                className="input-role-trigger"
                onClick={() => { setTimeMenuOpen(v => !v); setTimeIdx(TIME_RANGES.findIndex(t => t.key === options.timeRange)); }}
                onKeyDown={e => {
                  if (!timeMenuOpen) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setTimeIdx(i => (i + 1) % TIME_RANGES.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setTimeIdx(i => (i - 1 + TIME_RANGES.length) % TIME_RANGES.length); }
                  else if (e.key === 'Enter' && timeIdx >= 0) { e.preventDefault(); setOptions(o => ({ ...o, timeRange: TIME_RANGES[timeIdx].key })); setTimeMenuOpen(false); }
                  else if (e.key === 'Escape') { e.preventDefault(); setTimeMenuOpen(false); }
                }}
                aria-haspopup="listbox"
                aria-expanded={timeMenuOpen}
                title="选择时间范围"
              >
                <span className="input-role-icon">📅</span>
                <span className="input-role-label">
                  {TIME_RANGES.find(t => t.key === options.timeRange)?.label}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <Popover
                open={timeMenuOpen}
                anchorRef={timeMenuRef}
                onClose={() => setTimeMenuOpen(false)}
                className="input-role-menu"
              >
                <div role="listbox">
                  {TIME_RANGES.map(t => (
                    <button
                      key={t.key}
                      type="button"
                      role="option"
                      aria-selected={t.key === options.timeRange}
                      className={`input-role-item ${t.key === options.timeRange ? 'is-active' : ''} ${timeIdx === TIME_RANGES.indexOf(t) ? 'is-focused' : ''}`}
                      onClick={() => {
                        setOptions(o => ({ ...o, timeRange: t.key }));
                        setTimeMenuOpen(false);
                      }}
                    >
                      <div className="input-role-item-text">
                        <div className="input-role-item-label">{t.label}</div>
                      </div>
                      {t.key === options.timeRange && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </Popover>
            </div>

          </div>

          <div className="input-toolbar-right">
            {onOpenTips && (
              <button
                type="button"
                className="input-examples-btn"
                onClick={onOpenTips}
                title="查看可用的测试数据（供应商、PO、编号范围）"
              >
                <span>💡</span>
                测试数据
              </button>
            )}
            {onOpenExamples && (
              <button
                type="button"
                className="input-examples-btn"
                onClick={onOpenExamples}
                title="浏览示例问题库"
              >
                <span>📚</span>
                示例
              </button>
            )}
            <button
              type="button"
              className="input-new-prompt"
              onClick={handleNewPrompt}
              disabled={!input}
              title="清空输入"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              </svg>
              新提示
            </button>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={handleCompositionEnd}
          placeholder={disabled ? '助手正在分析中...' : '输入 / 浏览示例，或直接向 AI 提问...'}
          disabled={disabled}
          maxLength={INPUT_MAX_LENGTH}
          rows={1}
        />

        <div className="input-actions">
          <div className="input-meta">
            <button
              type="button"
              className="input-hint input-hint-button"
              onClick={toggleSendShortcut}
              title="点击切换发送快捷键"
            >
              {sendShortcut === 'enter' ? (
                <>
                  <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行 · <kbd>/</kbd> 示例
                </>
              ) : (
                <>
                  <kbd>{MOD_LABEL}+Enter</kbd> 发送 · <kbd>Enter</kbd> 换行 · <kbd>/</kbd> 示例
                </>
              )}
              {softProtected && (
                <span className="input-hint-soft-protect" title="长消息软保护：按 Enter 将换行，发送请用 ⌘+Enter">
                  · 长消息模式
                </span>
              )}
            </button>
            {justSwitched && (
              <span className="input-shortcut-tip">
                ✓ 已切换为
                {sendShortcut === 'enter' ? ' Enter ' : ` ${MOD_LABEL}+Enter `}
                发送
              </span>
            )}
            <span className="input-meta-sep">·</span>
            <span
              className={`input-char-count ${charCount >= INPUT_MAX_LENGTH ? 'is-limit' : charCount > INPUT_MAX_LENGTH * 0.9 ? 'is-warn' : ''}`}
              title={`最多 ${INPUT_MAX_LENGTH} 字`}
            >
              {charCount} / {INPUT_MAX_LENGTH}
            </span>
            {lastDurationMs !== undefined && lastDurationMs > 0 && (
              <>
                <span className="input-meta-sep">·</span>
                <span className="input-last-duration">上次 {formatMs(lastDurationMs)}</span>
              </>
            )}
          </div>
          {disabled && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="send-btn send-btn--stop"
              aria-label="停止生成"
              title="停止生成"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="send-btn"
              aria-label="发送"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
