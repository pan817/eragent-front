/**
 * 统计历史分析任务耗时，给 loading 气泡提供"通常需要 X 秒"的估算。
 *
 * Why: 用户看到纯 loading 不知道要等多久；有了平均耗时他能建立预期。
 * How: localStorage 滚动保留最近 N 次成功任务的 duration_ms；读时取中位数（更抗离群）。
 * 失败/超时任务不计入；避免被一次超长失败把平均值拉偏。
 */

const STORAGE_KEY = 'erp-agent-analysis-durations-v1';
const MAX_SAMPLES = 10;

function loadSamples(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(n => typeof n === 'number' && n > 0 && n < 30 * 60 * 1000);
  } catch {
    return [];
  }
}

function saveSamples(samples: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // quota exceeded 等情况静默吞掉
  }
}

export function recordDuration(durationMs: number | undefined): void {
  if (!durationMs || durationMs <= 0) return;
  const samples = loadSamples();
  samples.push(durationMs);
  while (samples.length > MAX_SAMPLES) samples.shift();
  saveSamples(samples);
}

/**
 * 返回历史中位数（毫秒），样本不足 3 条返回 null 不展示估算
 * —— 避免"第一次就给一个不靠谱的数字"。
 */
export function getTypicalDurationMs(): number | null {
  const samples = loadSamples();
  if (samples.length < 3) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
