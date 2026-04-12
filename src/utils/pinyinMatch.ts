import { pinyin } from 'pinyin-pro';

interface PinyinCache {
  full: string;   // 全拼，无空格无声调：sanlupipei
  initials: string; // 首字母：slpp
}

const cache = new Map<string, PinyinCache>();

function getPinyin(text: string): PinyinCache {
  const cached = cache.get(text);
  if (cached) return cached;

  const full = pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
  const initials = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();

  const result = { full, initials };
  cache.set(text, result);
  return result;
}

/**
 * 判断 text 是否匹配 query。
 * 依次尝试：原文子串 → 全拼子串 → 首字母子串
 */
export function matchPinyin(text: string, query: string): boolean {
  const q = query.toLowerCase();
  if (text.toLowerCase().includes(q)) return true;
  const { full, initials } = getPinyin(text);
  return full.includes(q) || initials.includes(q);
}
