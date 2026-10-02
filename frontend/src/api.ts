import { API_BASE_URL } from './config'
import type { ChatResponse } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Sends one question. Pass the session id from the previous reply to keep the
 * conversation's context on the server; omit it to start a new conversation.
 *
 * The backend answers with a single JSON body. If it later gains a streaming
 * endpoint, only this module and the reveal step in useChat need to change.
 */
export async function sendChat(
  query: string,
  sessionId: string | null,
  signal: AbortSignal,
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionId ? { query, session_id: sessionId } : { query }),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(response.status)
  }

  const data = (await response.json()) as Partial<ChatResponse>
  return {
    answer: typeof data.answer === 'string' ? data.answer : '',
    sources: Array.isArray(data.sources) ? data.sources : [],
    session_id: typeof data.session_id === 'string' ? data.session_id : '',
  }
}
