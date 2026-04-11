import { useState } from 'react'
import ChatWindow from './components/ChatWindow'
import './App.css'

const USER_ID_KEY = 'eragent_user_id'

function App() {
  const [userId, setUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(USER_ID_KEY)
    } catch {
      return null
    }
  })

  const handleLogin = (name: string) => {
    try {
      localStorage.setItem(USER_ID_KEY, name)
    } catch {
      // ignore storage failures
    }
    setUserId(name)
  }

  const handleLogout = () => {
    try {
      localStorage.removeItem(USER_ID_KEY)
    } catch {
      // ignore storage failures
    }
    setUserId(null)
  }

  return (
    <ChatWindow
      userId={userId}
      onLogin={handleLogin}
      onLogout={handleLogout}
    />
  )
}

export default App
