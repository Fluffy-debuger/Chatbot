import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import ReactMarkdown from 'react-markdown'
import { api } from '../lib/api.js'
import './ChatWindow.css'

const MODES = [
  { id: 'text', label: 'Chat' },
  { id: 'image', label: 'Image' },
  { id: 'vision', label: 'Vision' },
]

export default function ChatWindow({ chatId, onChatTouched, onError }) {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('text')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const fileInputRef = useRef(null)
  const scrollRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getMessages(getToken, chatId)
      .then(({ messages }) => {
        if (!cancelled) setMessages(messages)
      })
      .catch((err) => onError?.(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingText])

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFilePreview(URL.createObjectURL(f))
  }

  const clearFile = () => {
    setFile(null)
    setFilePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const sendText = useCallback(
    async (prompt) => {
      const userMsg = { id: `tmp-${Date.now()}`, role: 'user', type: 'text', content: prompt }
      setMessages((prev) => [...prev, userMsg])
      setStreamingText('')
      setSending(true)

      const controller = new AbortController()
      abortRef.current = controller

      let acc = ''
      try {
        await api.streamText(getToken, chatId, prompt, {
          signal: controller.signal,
          onToken: (chunk) => {
            acc += chunk
            setStreamingText(acc)
          },
          onDone: () => {
            setMessages((prev) => [
              ...prev,
              { id: `tmp-a-${Date.now()}`, role: 'assistant', type: 'text', content: acc },
            ])
            setStreamingText('')
            setSending(false)
            onChatTouched(chatId, { title: undefined, updated_at: new Date().toISOString() })
          },
          onError: (msg) => {
            onError?.(msg)
            setStreamingText('')
            setSending(false)
          },
        })
      } catch (err) {
        onError?.(err.message)
        setStreamingText('')
        setSending(false)
      }
    },
    [chatId, getToken, onChatTouched, onError]
  )

  const sendImage = useCallback(
    async (prompt) => {
      const userMsg = { id: `tmp-${Date.now()}`, role: 'user', type: 'image', content: prompt }
      setMessages((prev) => [...prev, userMsg])
      setSending(true)
      try {
        const { image } = await api.generateImage(getToken, chatId, prompt)
        setMessages((prev) => [
          ...prev,
          {
            id: `tmp-a-${Date.now()}`,
            role: 'assistant',
            type: 'image',
            content: prompt,
            image_url: image,
          },
        ])
        onChatTouched(chatId, { updated_at: new Date().toISOString() })
      } catch (err) {
        onError?.(err.message)
        // Roll back the optimistic user message on failure so the chat
        // doesn't show a question with no answer and no error context.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
      } finally {
        setSending(false)
      }
    },
    [chatId, getToken, onChatTouched, onError]
  )

  const sendVision = useCallback(
    async (question) => {
      if (!file) {
        onError?.('Attach an image to ask about it.')
        return
      }
      const userMsg = {
        id: `tmp-${Date.now()}`,
        role: 'user',
        type: 'vision',
        content: question,
        image_url: filePreview,
      }
      setMessages((prev) => [...prev, userMsg])
      setSending(true)
      const fileToSend = file
      clearFile()
      try {
        const { answer } = await api.askVision(getToken, chatId, question, fileToSend)
        setMessages((prev) => [
          ...prev,
          { id: `tmp-a-${Date.now()}`, role: 'assistant', type: 'vision', content: answer },
        ])
        onChatTouched(chatId, { updated_at: new Date().toISOString() })
      } catch (err) {
        onError?.(err.message)
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
      } finally {
        setSending(false)
      }
    },
    [chatId, file, filePreview, getToken, onChatTouched, onError]
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || sending) return
    setInput('')
    if (mode === 'text') sendText(trimmed)
    else if (mode === 'image') sendImage(trimmed)
    else if (mode === 'vision') sendVision(trimmed)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="chat-window">
      <div className="chat-scroll" ref={scrollRef}>
        {loading ? (
          <div className="chat-loading">Loading messages…</div>
        ) : messages.length === 0 && !streamingText ? (
          <div className="chat-window-empty">
            <p>This chat is empty. Say something to get started.</p>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {streamingText && (
              <MessageBubble
                message={{ role: 'assistant', type: 'text', content: streamingText }}
                streaming
              />
            )}
          </div>
        )}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer-modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-btn ${mode === m.id ? 'mode-btn-active' : ''}`}
              onClick={() => {
                setMode(m.id)
                if (m.id !== 'vision') clearFile()
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'vision' && (
          <div className="vision-attach">
            {filePreview ? (
              <div className="vision-preview">
                <img src={filePreview} alt="Selected upload" />
                <button type="button" onClick={clearFile} aria-label="Remove image">✕</button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-attach"
                onClick={() => fileInputRef.current?.click()}
              >
                📎 Attach image
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              onChange={handleFileSelect}
              hidden
            />
          </div>
        )}

        <div className="composer-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'text'
                ? 'Message…'
                : mode === 'image'
                ? 'Describe the image to generate…'
                : 'Ask a question about the attached image…'
            }
            rows={1}
            disabled={sending}
          />
          <button type="submit" className="btn-send" disabled={sending || !input.trim()}>
            {sending ? '…' : '↑'}
          </button>
        </div>
      </form>
    </div>
  )
}

function MessageBubble({ message, streaming }) {
  const isUser = message.role === 'user'
  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-bubble">
        {message.type === 'image' && message.image_url ? (
          <>
            <p className="message-caption">{message.content}</p>
            <img className="message-image" src={message.image_url} alt={message.content} />
          </>
        ) : message.type === 'vision' && isUser && message.image_url ? (
          <>
            <img className="message-image" src={message.image_url} alt="Uploaded" />
            <p>{message.content}</p>
          </>
        ) : (
          <div className="message-text">
            <ReactMarkdown>{message.content || ''}</ReactMarkdown>
            {streaming && <span className="cursor-blink">▌</span>}
          </div>
        )}
      </div>
    </div>
  )
}
