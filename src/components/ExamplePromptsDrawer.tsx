import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  CATEGORIES,
  EXAMPLE_PROMPTS,
  type ExamplePrompt,
  type PromptCategory,
} from '../data/examplePrompts';
import './ExamplePromptsDrawer.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (prompt: ExamplePrompt) => void;
}

type FilterKey = PromptCategory | 'all';

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/** 默认显示的分类数（不含"全部"按钮），超出部分需展开 */
const VISIBLE_CATEGORY_COUNT = 5;
const SEARCH_STORAGE_KEY = 'erp-agent-examples-search-v1';
const FILTER_STORAGE_KEY = 'erp-agent-examples-filter-v1';

export default function ExamplePromptsDrawer({ open, onClose, onPick }: Props) {
  const [search, setSearch] = useState(() => {
    try {
      return sessionStorage.getItem(SEARCH_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [filter, setFilter] = useState<FilterKey>(() => {
    try {
      return (sessionStorage.getItem(FILTER_STORAGE_KEY) as FilterKey) || 'all';
    } catch {
      return 'all';
    }
  });
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, open);

  // 打开时聚焦搜索框；搜索/分类选择保留在 sessionStorage，关闭后再次打开恢复
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    try {
      if (search) sessionStorage.setItem(SEARCH_STORAGE_KEY, search);
      else sessionStorage.removeItem(SEARCH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [search]);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, filter);
    } catch {
      // ignore
    }
  }, [filter]);

  // Escape 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: EXAMPLE_PROMPTS.length };
    for (const p of EXAMPLE_PROMPTS) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return EXAMPLE_PROMPTS.filter(p => {
      if (filter !== 'all' && p.category !== filter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) || p.query.toLowerCase().includes(q)
      );
    });
  }, [search, filter]);

  const grouped = useMemo(() => {
    const map = new Map<PromptCategory, ExamplePrompt[]>();
    for (const p of filtered) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return CATEGORIES.filter(c => map.has(c.key)).map(c => ({
      category: c,
      prompts: map.get(c.key)!,
    }));
  }, [filtered]);

  if (!open) return null;

  const handlePickClick = (p: ExamplePrompt) => {
    onPick(p);
    onClose();
  };

  return (
    <>
      <div className="modal-overlay examples-backdrop" onClick={onClose} />
      <aside
        className="examples-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="examples-drawer-title"
      >
        <div className="examples-header">
          <div className="examples-header-top">
            <div className="examples-header-title">
              <h2 id="examples-drawer-title">示例问题库</h2>
              <span className="examples-header-badge">{EXAMPLE_PROMPTS.length} 条</span>
            </div>
            <button
              type="button"
              className="examples-close"
              onClick={onClose}
              aria-label="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="examples-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="搜索问题关键词..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="examples-search-clear"
                onClick={() => setSearch('')}
                aria-label="清空"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className={`examples-chips ${chipsExpanded ? 'is-expanded' : ''}`}>
          <button
            type="button"
            className={`examples-chip ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 <span className="examples-chip-count">{categoryCounts.all}</span>
          </button>
          {(chipsExpanded ? CATEGORIES : CATEGORIES.slice(0, VISIBLE_CATEGORY_COUNT)).map(c => (
            <button
              key={c.key}
              type="button"
              className={`examples-chip ${filter === c.key ? 'is-active' : ''}`}
              onClick={() => setFilter(c.key)}
            >
              <span>{c.icon}</span>
              {c.label}
              <span className="examples-chip-count">{categoryCounts[c.key] || 0}</span>
            </button>
          ))}
          {CATEGORIES.length > VISIBLE_CATEGORY_COUNT && (
            <button
              type="button"
              className="examples-chip examples-chip-toggle"
              onClick={() => setChipsExpanded(v => !v)}
            >
              {chipsExpanded ? (
                <>
                  收起
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </>
              ) : (
                <>
                  更多
                  <span className="examples-chip-count">{CATEGORIES.length - VISIBLE_CATEGORY_COUNT}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </>
              )}
            </button>
          )}
        </div>

        <div className="examples-body">
          {grouped.length === 0 ? (
            <div className="examples-empty">
              <div className="examples-empty-icon">🔍</div>
              未找到匹配的问题
            </div>
          ) : (
            grouped.map(({ category, prompts }) => (
              <div key={category.key} className="examples-group">
                <div className="examples-group-header">
                  <span className="examples-group-icon">{category.icon}</span>
                  <span className="examples-group-title">{category.label}</span>
                  <span className="examples-group-hint">{category.description}</span>
                </div>
                {prompts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className="examples-item"
                    onClick={() => handlePickClick(p)}
                  >
                    <div className="examples-item-main">
                      <div className="examples-item-title">
                        {highlight(p.title, search)}
                      </div>
                      <div className="examples-item-query">
                        {highlight(p.query, search)}
                      </div>
                      {p.editable && (
                        <div className="examples-item-badge">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          含参数，请先修改 ID
                        </div>
                      )}
                    </div>
                    <div className="examples-item-arrow">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
