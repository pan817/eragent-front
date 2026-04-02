import type { ChatMessage } from '../types/api';
import MarkdownContent from './MarkdownContent';

interface Props {
  message: ChatMessage;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-row ${isUser ? 'message-row-user' : 'message-row-assistant'}`}>
      <div className={`avatar ${isUser ? 'avatar-user' : 'avatar-assistant'}`}>
        {isUser ? '👤' : '🤖'}
      </div>
      <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
        {isUser ? (
          <p className="user-text">{message.content}</p>
        ) : (
          <>
            {message.status === 'sending' ? (
              <div className="loading">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <span className="loading-text">分析中，请稍候...</span>
              </div>
            ) : message.status === 'error' ? (
              <p className="error-text">{message.content}</p>
            ) : (
              <>
                <MarkdownContent content={message.content} />
                {message.durationMs && (
                  <div className="message-meta">
                    耗时 {(message.durationMs / 1000).toFixed(1)}s
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
