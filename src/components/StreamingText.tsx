import { memo } from 'react';
import './StreamingText.css';

interface Props {
  text: string;
  /** 当前 chunk 是否处于"gap 缺失"状态；true 时光标位置加占位符提示 */
  broken?: boolean;
}

/**
 * LLM 流式输出的打字机渲染（docs/sse_front_spec.md §5.2 方案 A）。
 *
 * Why 纯文本不渲染 markdown：每个 chunk 触发一次 markdown 解析在长报告下会退化为 O(n²)
 * 导致浏览器卡顿；done 后由 MessageBubble 一次性切回 MarkdownContent 渲染完整报告。
 *
 * Why 不再提供 onStop：停止入口统一收到输入栏（发送按钮变停止按钮），
 * 气泡内保持纯净，避免右上角按钮和 markdown 正文排版打架 + 误触。
 */
function StreamingText({ text, broken }: Props) {
  return (
    <div className="streaming-text">
      <div className="streaming-text-body">
        <span className="streaming-text-content">{text}</span>
        {broken && <span className="streaming-text-gap" aria-label="内容有缺失，等待最终结果">…</span>}
        <span className="streaming-text-cursor" aria-hidden="true">▍</span>
      </div>
    </div>
  );
}

export default memo(StreamingText);
