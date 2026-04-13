/** 毫秒格式化为 "123ms" 或 "1.5s" */
export const formatMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

/** 相对时间（基于 Date 对象） */
export function formatRelativeTime(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 10) return '刚刚';
  if (diff < 60) return `${Math.floor(diff)} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return date.toLocaleDateString();
}

/** 相对时间（基于时间戳 ms） */
export function formatRelativeTimeFromTs(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
