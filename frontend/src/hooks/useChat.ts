import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, sendChat } from '../api'
import { REQUEST_TIMEOUT_MS } from '../config'
import type { ChatMessage, Conversation } from '../types'

const STORAGE_KEY = 'aravana-case-assistant.conversations.v2'
const MAX_CONVERSATIONS = 30
const TITLE_LENGTH = 48

interface Stored {
  conversations: Conversation[]
  activeId: string | null
}

/**
 * Conversations live in sessionStorage: they survive a reload and are gone when
 * the tab closes. Case details should not linger on a shared computer.
 */
function load(): Stored {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>
      const conversations = (Array.isArray(parsed.conversations) ? parsed.conversations : [])
        .map((c) => ({ ...c, messages: c.messages.filter((m) => m.state === 'done') }))
        .filter((c) => c.messages.length > 0)
      const activeId = conversations.some((c) => c.id === parsed.activeId)
        ? (parsed.activeId ?? null)
        : null
      return { conversations, activeId }
    }
  } catch {
    // Storage unavailable or corrupted: start fresh.
  }
  return { conversations: [], activeId: null }
}

function save(stored: Stored) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Private mode or quota: the chat still works, it just will not survive a reload.
  }
}

function makeTitle(query: string): string {
  const line = query.replace(/\s+/g, ' ').trim()
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH).trimEnd()}…` : line
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
  const initial = useRef(load()).current
  const [conversations, setConversations] = useState<Conversation[]>(initial.conversations)
  const [activeId, setActiveId] = useState<string | null>(initial.activeId)
  const [busy, setBusy] = useState(false)
  /** Text for screen readers, set once per completed answer or error. */
  const [announcement, setAnnouncement] = useState('')

  // Latest values for callbacks that outlive a render (requests, timers).
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const activeRef = useRef(activeId)
  activeRef.current = activeId
  const busyRef = useRef(false)
  const request = useRef<{ controller: AbortController; cancelled: boolean } | null>(null)

  const markBusy = (value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }

  useEffect(() => {
    save({
      activeId,
      conversations: conversations
        .map((c) => ({ ...c, messages: c.messages.filter((m) => m.state === 'done') }))
        .filter((c) => c.messages.length > 0),
    })
  }, [conversations, activeId])

  const updateConversation = (id: string, change: (c: Conversation) => Conversation) =>
    setConversations((list) => list.map((c) => (c.id === id ? change(c) : c)))

  const patchMessage = (conversationId: string, messageId: string, changes: Partial<ChatMessage>) =>
    updateConversation(conversationId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...changes } : m)),
    }))

  const ask = useCallback(
    async (conversationId: string, sessionId: string | null, query: string, replyId: string) => {
      markBusy(true)
      const current = { controller: new AbortController(), cancelled: false }
      request.current = current
      let timedOut = false
      const timer = window.setTimeout(() => {
        timedOut = true
        current.controller.abort()
      }, REQUEST_TIMEOUT_MS)

      try {
        const data = await sendChat(query, sessionId, current.controller.signal)
        const answer = data.answer.trim() || 'No answer was returned for this question.'
        updateConversation(conversationId, (c) => ({
          ...c,
          sessionId: data.session_id || c.sessionId,
          messages: c.messages.map((m) =>
            m.id === replyId
              ? { ...m, text: answer, sources: data.sources, state: 'revealing' }
              : m,
          ),
        }))
        setAnnouncement(answer)
        // Still busy: the answer is being printed. finishReveal() releases the composer.
      } catch (error) {
        if (current.cancelled) {
          updateConversation(conversationId, (c) => ({
            ...c,
            messages: c.messages.filter((m) => m.id !== replyId),
          }))
        } else {
          const text = describeError(error, timedOut)
          patchMessage(conversationId, replyId, { text, state: 'error' })
          setAnnouncement(text)
        }
        markBusy(false)
      } finally {
        window.clearTimeout(timer)
        if (request.current === current) request.current = null
      }
    },
    [],
  )

  const send = useCallback(
    (raw: string) => {
      const query = raw.trim()
      if (!query || busyRef.current) return

      const replyId = crypto.randomUUID()
      const turn: ChatMessage[] = [
        { id: crypto.randomUUID(), role: 'user', text: query, state: 'done' },
        { id: replyId, role: 'assistant', text: '', state: 'pending' },
      ]

      const existing = conversationsRef.current.find((c) => c.id === activeRef.current)
      if (existing) {
        updateConversation(existing.id, (c) => ({
          ...c,
          messages: [...c.messages.filter((m) => m.state !== 'error'), ...turn],
        }))
        void ask(existing.id, existing.sessionId, query, replyId)
        return
      }

      const created: Conversation = {
        id: crypto.randomUUID(),
        title: makeTitle(query),
        sessionId: null,
        messages: turn,
      }
      setConversations((list) => [created, ...list].slice(0, MAX_CONVERSATIONS))
      setActiveId(created.id)
      void ask(created.id, null, query, replyId)
    },
    [ask],
  )

  /** Re-sends the last question of the open conversation after a failure. */
  const retry = useCallback(() => {
    if (busyRef.current) return
    const conversation = conversationsRef.current.find((c) => c.id === activeRef.current)
    const lastQuestion = conversation && [...conversation.messages].reverse().find((m) => m.role === 'user')
    if (!conversation || !lastQuestion) return
    const replyId = crypto.randomUUID()
    updateConversation(conversation.id, (c) => ({
      ...c,
      messages: [
        ...c.messages.filter((m) => m.state !== 'error'),
        { id: replyId, role: 'assistant', text: '', state: 'pending' },
      ],
    }))
    void ask(conversation.id, conversation.sessionId, lastQuestion.text, replyId)
  }, [ask])

  /** Called by a message once its text is fully printed. */
  const finishReveal = useCallback((messageId: string) => {
    setConversations((list) =>
      list.map((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId ? { ...m, state: 'done' } : m)),
      })),
    )
    markBusy(false)
  }, [])

  /** Cancels a request in flight, or skips to the end of an answer being printed. */
  const stop = useCallback(() => {
    if (request.current) {
      request.current.cancelled = true
      request.current.controller.abort()
      return
    }
    setConversations((list) =>
      list.map((c) =>
        c.messages.some((m) => m.state === 'revealing')
          ? { ...c, messages: c.messages.map((m) => (m.state === 'revealing' ? { ...m, state: 'done' } : m)) }
          : c,
      ),
    )
    markBusy(false)
  }, [])

  /** Opens another conversation. Anything still in progress is stopped first. */
  const select = useCallback(
    (id: string) => {
      if (id === activeRef.current) return
      stop()
      setAnnouncement('')
      setActiveId(id)
    },
    [stop],
  )

  /** Shows the empty "new chat" screen; the conversation is created on the first question. */
  const startNew = useCallback(() => {
    stop()
    setAnnouncement('')
    setActiveId(null)
  }, [stop])

  const remove = useCallback(
    (id: string) => {
      if (id === activeRef.current) {
        stop()
        setActiveId(null)
      }
      setConversations((list) => list.filter((c) => c.id !== id))
    },
    [stop],
  )

  const active = conversations.find((c) => c.id === activeId) ?? null

  return {
    conversations,
    activeId,
    title: active?.title ?? null,
    messages: active?.messages ?? [],
    busy,
    announcement,
    send,
    retry,
    stop,
    select,
    startNew,
    remove,
    finishReveal,
  }
}
