import React, { useState, useEffect, useCallback } from 'react'
import { useAuth, UserButton,useUser } from '@clerk/clerk-react'
import { api } from '../lib/api.js'
import Sidebar from './Sidebar.jsx'
import ChatWindow from './ChatWindow.jsx'
import './ChatApp.css'

export default function ChatApp() {
  const { getToken } = useAuth()
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [loadingChats, setLoadingChats] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState(null)

  const refreshChats = useCallback(async () => {
    try {
      const { chats } = await api.listChats(getToken)
      setChats(chats)
      return chats
    } catch (err) {
      setError(err.message)
      return []
    }
  }, [getToken])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingChats(true)
      const list = await refreshChats()
      if (!cancelled && list.length > 0) {
        setActiveChatId(list[0].id)
      }
      if (!cancelled) setLoadingChats(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNewChat = async () => {
    try {
      const chat = await api.createChat(getToken, 'New chat')
      setChats((prev) => [chat, ...prev])
      setActiveChatId(chat.id)
      setSidebarOpen(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteChat = async (chatId) => {
    try {
      await api.deleteChat(getToken, chatId)
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== chatId)
        if (activeChatId === chatId) {
          setActiveChatId(next[0]?.id ?? null)
        }
        return next
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleChatTouched = useCallback((chatId, patch) => {
    setChats((prev) => {
      const updated = prev.map((c) => (c.id === chatId ? { ...c, ...patch } : c))
      // Bump the touched chat to the top, mirroring updated_at ordering.
      const touched = updated.find((c) => c.id === chatId)
      const rest = updated.filter((c) => c.id !== chatId)
      return touched ? [touched, ...rest] : updated
    })
  }, [])

  return (
    <div className="chat-app">
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label="Toggle chat list"
      >
        ☰
      </button>

      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        loading={loadingChats}
        open={sidebarOpen}
        onSelect={(id) => {
          setActiveChatId(id)
          setSidebarOpen(false)
        }}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        userButton={<UserButton afterSignOutUrl="/" />}
        user={useUser()}

      />

      <main className="chat-main">
        {error && (
          <div className="banner-error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {loadingChats ? (
          <div className="chat-loading">Loading your chats…</div>
        ) : activeChatId ? (
          <ChatWindow
            key={activeChatId}
            chatId={activeChatId}
            onChatTouched={handleChatTouched}
            onError={setError}
          />
        ) : (
          <EmptyState onNewChat={handleNewChat} />
        )}
      </main>
    </div>
  )
}

function EmptyState({ onNewChat }) {
  return (
    <div className="empty-state">
      <h1>Start a conversation</h1>
      <p>Ask a question, generate an image, or upload a photo to ask about it.</p>
      <button className="btn-primary" onClick={onNewChat}>New chat</button>
    </div>
  )
}
