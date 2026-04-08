import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';

interface Props {
  content: string;
}

/** 把 HIGH / MEDIUM / LOW / CRITICAL / GOOD / OK 转为带颜色的徽章 */
function renderWithBadges(text: string): ReactNode {
  const regex = /\b(CRITICAL|HIGH|MEDIUM|LOW|GOOD|OK|SUCCESS|FAILED|ERROR)\b/g;
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const level = match[0].toLowerCase();
    parts.push(
      <span key={key++} className={`severity-badge severity-${level}`}>
        {match[0]}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 0 ? parts : text;
}

function transformChildren(children: ReactNode): ReactNode {
  if (typeof children === 'string') return renderWithBadges(children);
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === 'string' ? <span key={i}>{renderWithBadges(c)}</span> : c
    );
  }
  return children;
}

export default function MarkdownContent({ content }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="table-wrapper">
              <table>{children}</table>
            </div>
          ),
          td: ({ children }) => <td>{transformChildren(children)}</td>,
          th: ({ children }) => <th>{children}</th>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
