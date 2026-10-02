/** One document the answer was drawn from, as returned by POST /chat. */
export interface Source {
  filename: string | null
  client_name: string | null
  doc_type: string | null
  case_id: string | null
}

export interface ChatResponse {
  answer: string
  sources: Source[]
  session_id: string
}

/**
 * pending   – request sent, no answer yet
 * revealing – answer received, being printed progressively
 * done      – fully shown
 * error     – the request failed; `text` holds the message for the user
 */
export type MessageState = 'pending' | 'revealing' | 'done' | 'error'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  state: MessageState
  sources?: Source[]
}

/** One chat in the sidebar. `sessionId` is the server-side memory key for it. */
export interface Conversation {
  id: string
  title: string
  sessionId: string | null
  messages: ChatMessage[]
}
