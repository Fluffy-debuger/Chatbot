const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

/**
 * Thin fetch wrapper that attaches the Clerk bearer token and normalizes
 * error handling. `getToken` is the function from Clerk's useAuth().
 */
async function request(getToken, path, options = {}) {
  const token = await getToken()
  const headers = { ...(options.headers || {}) }

  // Don't force JSON content-type when sending FormData (vision upload) -
  // the browser needs to set the multipart boundary itself.
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const data = await res.json()
      detail = data.detail || data.error || detail
    } catch {
      // response wasn't JSON, keep generic message
    }
    throw new Error(detail)
  }

  return res
}

export const api = {
  listChats: (getToken) =>
    request(getToken, '/api/chats').then((r) => r.json()),

  createChat: (getToken, title) =>
    request(getToken, '/api/chats', {
      method: 'POST',
      body: JSON.stringify({ title: title || 'New chat' }),
    }).then((r) => r.json()),

  getMessages: (getToken, chatId) =>
    request(getToken, `/api/chats/${chatId}/messages`).then((r) => r.json()),

  renameChat: (getToken, chatId, title) =>
    request(getToken, `/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }).then((r) => r.json()),

  deleteChat: (getToken, chatId) =>
    request(getToken, `/api/chats/${chatId}`, { method: 'DELETE' }).then((r) => r.json()),

  generateImage: (getToken, chatId, prompt) =>
    request(getToken, '/api/imagine', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId, prompt }),
    }).then((r) => r.json()),

  askVision: (getToken, chatId, question, file) => {
    const form = new FormData()
    form.append('chat_id', chatId)
    form.append('ques', question)
    form.append('img', file)
    return request(getToken, '/api/vision', { method: 'POST', body: form }).then((r) => r.json())
  },

  /**
   * Streams a text completion via SSE. Calls onToken for each chunk and
   * onDone when the stream closes. Throws on network/HTTP failure.
   */
  streamText: async (getToken, chatId, prompt, { onToken, onDone, onError, signal }) => {
    const token = await getToken()
    const res = await fetch(`${API_BASE_URL}/api/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ chat_id: chatId, prompt }),
      signal,
    })

    if (!res.ok || !res.body) {
      let detail = `Request failed (${res.status})`
      try {
        const data = await res.json()
        detail = data.detail || data.error || detail
      } catch {
        // ignore
      }
      throw new Error(detail)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const evt of events) {
          if (!evt.startsWith('data: ')) continue
          const payload = evt.slice(6).replace(/\\n/g, '\n')
          if (payload === '[DONE]') {
            onDone?.()
            return
          }
          if (payload.startsWith('[ERROR]')) {
            onError?.(payload.replace('[ERROR] ', ''))
            return
          }
          onToken?.(payload)
        }
      }
      onDone?.()
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message)
    }
  },
}
