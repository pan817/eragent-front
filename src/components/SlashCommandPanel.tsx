import { useEffect, useMemo, useRef } from 'react';
import {
  CATEGORIES,
  EXAMPLE_PROMPTS,
  type ExamplePrompt,
  type PromptCategory,
} from '../data/examplePrompts';
import { matchPinyin } from '../utils/pinyinMatch';
import './SlashCommandPanel.css';

interface Props {
  filter: string;
  activeIndex: number;
  onPick: (prompt: ExamplePrompt) => void;
}

export interface SlashPanelHandle {
  filteredItems: ExamplePrompt[];
}

export default function SlashCommandPanel({ filter, activeIndex, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!filter) return EXAMPLE_PROMPTS;
    return EXAMPLE_PROMPTS.filter(
      p =>
        matchPinyin(p.title, filter) ||
        matchPinyin(p.query, filter) ||
        (p.aliases?.some(a => matchPinyin(a, filter)) ?? false)
    );
  }, [filter]);

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

  // 滚动激活项到可视区
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('.slash-panel-item.is-active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // 平铺索引
  let flatIdx = 0;

  if (filtered.length === 0) {
    return (
      <div className="slash-panel" ref={listRef}>
        <div className="slash-panel-empty">未找到匹配的示例</div>
        <div className="slash-panel-footer">
          <kbd>Esc</kbd> 关闭
        </div>
      </div>
    );
  }

  return (
    <div className="slash-panel" ref={listRef}>
      {grouped.map(({ category, prompts }) => (
        <div key={category.key}>
          <div className="slash-panel-group-label">
            <span>{category.icon}</span>
            <span>{category.label}</span>
          </div>
          {prompts.map(p => {
            const idx = flatIdx++;
            return (
              <button
                key={p.id}
                type="button"
                className={`slash-panel-item ${idx === activeIndex ? 'is-active' : ''}`}
                onMouseDown={e => { e.preventDefault(); onPick(p); }}
              >
                <div className="slash-panel-item-text">
                  <div className="slash-panel-item-title">{p.title}</div>
                  <div className="slash-panel-item-query">{p.query}</div>
                </div>
                {p.editable && (
                  <span className="slash-panel-item-badge">可编辑</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
      <div className="slash-panel-footer">
        <kbd>↑↓</kbd> 选择
        <kbd>Enter</kbd> 确认
        <kbd>Esc</kbd> 关闭
      </div>
    </div>
  );
}

/** 工具函数：返回过滤后的示例列表，供 InputBar 计算 activeIndex 用 */
export function getFilteredPrompts(filter: string): ExamplePrompt[] {
  if (!filter) return EXAMPLE_PROMPTS;
  return EXAMPLE_PROMPTS.filter(
    p =>
      matchPinyin(p.title, filter) ||
      matchPinyin(p.query, filter) ||
      (p.aliases?.some(a => matchPinyin(a, filter)) ?? false)
  );
}
