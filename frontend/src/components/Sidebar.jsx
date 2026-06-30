import React from 'react'
import './Sidebar.css'

export default function Sidebar({
  chats,
  activeChatId,
  loading,
  open,
  onSelect,
  onNewChat,
  onDeleteChat,
  userButton,
  user,
}) {
  
  return (
    <>
      {open && <div className="sidebar-scrim" onClick={() => onSelect(activeChatId)} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-mark">CB</span>
            <span>ChatBot</span>
          </div>
          <button className="btn-new-chat" onClick={onNewChat}>
            + New chat
          </button>
        </div>

        <nav className="sidebar-list">
          {loading && <div className="sidebar-empty">Loading…</div>}
          {!loading && chats.length === 0 && (
            <div className="sidebar-empty">No chats yet. Start one above.</div>
          )}
          {chats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              active={chat.id === activeChatId}
              onSelect={() => onSelect(chat.id)}
              onDelete={() => onDeleteChat(chat.id)}
            />
          ))}
        </nav>

        <div className="sidebar-footer">
          {userButton} 
          <span>{user.user?.firstName}</span>
        </div>
      </aside>
    </>
  )
}

function ChatListItem({ chat, active, onSelect, onDelete }) {
  return (
    <div className={`chat-item ${active ? 'chat-item-active' : ''}`}>
      <button className="chat-item-btn" onClick={onSelect}>
        <span className="chat-item-title">{chat.title || 'New chat'}</span>
      </button>
      <button
        className="chat-item-delete"
        onClick={(e) => {
          e.stopPropagation()
          if (window.confirm('Delete this chat? This cannot be undone.')) {
            onDelete()
          }
        }}
        aria-label="Delete chat"
        title="Delete chat"
      >
        ✕
      </button>
    </div>
  )
}
