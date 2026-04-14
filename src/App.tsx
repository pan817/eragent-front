import { useEffect, useState } from 'react'
import ChatWindow from './components/ChatWindow'
import ErrorBoundary from './components/ErrorBoundary'
import ToastHost from './components/ToastHost'
import { useOnline } from './hooks/useOnline'
import { safeGetItem, safeSetItem, safeRemoveItem } from './utils/safeStorage'
import { showToast } from './utils/toast'
import { ApiError } from './types/api'
import './App.css'

const USER_ID_KEY = 'eragent_user_id'

function App() {
  const [userId, setUserId] = useState<string | null>(() => safeGetItem(USER_ID_KEY))
  const online = useOnline()

  const handleLogin = (name: string) => {
    safeSetItem(USER_ID_KEY, name)
    setUserId(name)
  }

  const handleLogout = () => {
    safeRemoveItem(USER_ID_KEY)
    setUserId(null)
  }

  // 全局未捕获的 Promise 拒绝：弹 toast，便于调试也避免静默吞掉
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      if (reason instanceof ApiError) {
        showToast(reason.message, { level: reason.isNetworkError() ? 'warn' : 'error' })
      } else if (reason instanceof Error) {
        showToast(`未处理的错误：${reason.message}`, { level: 'error' })
      } else {
        showToast('发生未知错误', { level: 'error' })
      }
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [])

  return (
    <ErrorBoundary>
      {!online && (
        <div className="offline-banner" role="status" aria-live="polite">
          <span className="offline-banner-dot" aria-hidden="true" />
          网络连接已断开，请求将暂时失败
        </div>
      )}
      <ChatWindow
        userId={userId}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
      <ToastHost />
    </ErrorBoundary>
  )
}

export default App
