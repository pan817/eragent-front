/**
 * 把字符串里会被 HTML 解析器当作标签/属性边界的字符转义掉。
 * 只用于把"本该当纯文本渲染的用户内容"拼进 HTML 字符串（如 window.open 打印导出）；
 * React 的 JSX 插值会自动转义，不要在 JSX 里用本函数。
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
