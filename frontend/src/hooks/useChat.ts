import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, sendChat } from '../api'
import { REQUEST_TIMEOUT_MS } from '../config'
import type { ChatMessage } from '../types'

const STORAGE_KEY = 'case-files-assistant.conversation.v1'

interface StoredConversation {
  sessionId: string | null
  messages: ChatMessage[]
}

/** The conversation survives a reload but not a closed tab (sessionStorage). */
function loadConversation(): StoredConversation {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredConversation>
      const messages = Array.isArray(parsed.messages)
        ? parsed.messages.filter((m) => m.state === 'done')
        : []
      return { sessionId: parsed.sessionId ?? null, messages }
    }
  } catch {
    // Storage unavailable or corrupted: start with an empty conversation.
  }
  return { sessionId: null, messages: [] }
}

function saveConversation(conversation: StoredConversation) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(conversation))
  } catch {
    // Private mode or quota: the chat still works, it just will not survive a reload.
  }
}

function describeError(error: unknown, timedOut: boolean): string {
  if (timedOut) {
    return 'The server took too long to respond. It may still be starting up. Please try again.'
  }
  if (error instanceof ApiError) {
    return error.status >= 500
      ? 'The server ran into a problem while answering. Please try again.'
      : `The request was not accepted (error ${error.status}).`
  }
  return 'Could not reach the server. Check your connection and try again.'
}

export function useChat() {
  const initial = useRef(loadConversation()).current
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages)
  const [busy, setBusy] = useState(false)
  /** Text for screen readers, set once per completed answer or error. */
  const [announcement, setAnnouncement] = useState('')

  const sessionId = useRef<string | null>(initial.sessionId)
  const busyRef = useRef(false)
  const request = useRef<{ controller: AbortController; cancelled: boolean } | null>(null)

  const markBusy = (value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }

  useEffect(() => {
    saveConversation({
      sessionId: sessionId.current,
      messages: messages.filter((m) => m.state === 'done'),
    })
  }, [messages])

  const patch = (id: string, changes: Partial<ChatMessage>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)))

  const ask = useCallback(async (query: string, replyId: string) => {
    markBusy(true)
    const current = { controller: new AbortController(), cancelled: false }
    request.current = current
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      current.controller.abort()
    }, REQUEST_TIMEOUT_MS)

    try {
      const data = await sendChat(query, sessionId.current, current.controller.signal)
      if (data.session_id) sessionId.current = data.session_id
      const answer = data.answer.trim() || 'No answer was returned for this question.'
      patch(replyId, { text: answer, sources: data.sources, state: 'revealing' })
      setAnnouncement(answer)
      // Still busy: the answer is being printed. finishReveal() releases the composer.
    } catch (error) {
      if (current.cancelled) {
        setMessages((list) => list.filter((m) => m.id !== replyId))
      } else {
        const text = describeError(error, timedOut)
        patch(replyId, { text, state: 'error' })
        setAnnouncement(text)
      }
      markBusy(false)
    } finally {
      window.clearTimeout(timer)
      if (request.current === current) request.current = null
    }
  }, [])

  const send = useCallback(
    (raw: string) => {
      const query = raw.trim()
      if (!query || busyRef.current) return
      const replyId = crypto.randomUUID()
      setMessages((list) => [
        ...list.filter((m) => m.state !== 'error'),
        { id: crypto.randomUUID(), role: 'user', text: query, state: 'done' },
        { id: replyId, role: 'assistant', text: '', state: 'pending' },
      ])
      void ask(query, replyId)
    },
    [ask],
  )

  /** Re-sends the last question after a failure. */
  const retry = useCallback(() => {
    if (busyRef.current) return
    const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastQuestion) return
    const replyId = crypto.randomUUID()
    setMessages((list) => [
      ...list.filter((m) => m.state !== 'error'),
      { id: replyId, role: 'assistant', text: '', state: 'pending' },
    ])
    void ask(lastQuestion.text, replyId)
  }, [ask, messages])

  /** Called by the message once its text is fully printed. */
  const finishReveal = useCallback((id: string) => {
    patch(id, { state: 'done' })
    markBusy(false)
  }, [])

  /** Cancels a request in flight, or skips to the end of an answer being printed. */
  const stop = useCallback(() => {
    if (request.current) {
      request.current.cancelled = true
      request.current.controller.abort()
      return
    }
    setMessages((list) =>
      list.map((m) => (m.state === 'revealing' ? { ...m, state: 'done' } : m)),
    )
    markBusy(false)
  }, [])

  /** Starts a new conversation: the server keeps no link to the old session id. */
  const reset = useCallback(() => {
    if (request.current) {
      request.current.cancelled = true
      request.current.controller.abort()
    }
    sessionId.current = null
    setMessages([])
    setAnnouncement('')
    markBusy(false)
  }, [])

  return { messages, busy, announcement, send, retry, stop, reset, finishReveal }
}
