import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { SLOW_NOTICE_MS } from '../config'
import { useReveal } from '../hooks/useReveal'
import type { ChatMessage } from '../types'
import { Sources } from './Sources'

interface MessageProps {
  message: ChatMessage
  onRevealed: (id: string) => void
  onRetry: () => void
}

export function Message({ message, onRevealed, onRetry }: MessageProps) {
  if (message.role === 'user') {
    return (
      <div className="message message-user">
        <span className="visually-hidden">You asked:</span>
        <p className="bubble" dir="auto">
          {message.text}
        </p>
      </div>
    )
  }

  if (message.state === 'pending') return <Pending />

  if (message.state === 'error') {
    return (
      <div className="message notice" role="alert">
        <p>{message.text}</p>
        <button type="button" className="button button-quiet" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  return <Answer message={message} onRevealed={onRevealed} />
}

function Answer({ message, onRevealed }: Pick<MessageProps, 'message' | 'onRevealed'>) {
  const revealing = message.state === 'revealing'
  const visibleText = useReveal(message.text, revealing, () => onRevealed(message.id))

  return (
    <article className="message message-assistant">
      <span className="visually-hidden">Answer:</span>
      {/* aria-hidden while printing: the full answer is announced once by the live region in App. */}
      <div className={revealing ? 'prose is-revealing' : 'prose'} dir="auto" aria-hidden={revealing}>
        <Markdown
          components={{
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {visibleText}
        </Markdown>
      </div>
      {!revealing && message.sources && message.sources.length > 0 && (
        <Sources sources={message.sources} />
      )}
    </article>
  )
}

function Pending() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="message pending">
      <p className="pending-line">
        Searching the case files
        <span className="dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
      {slow && (
        <p className="pending-note">
          Still working. If the server was idle it needs up to a minute to start.
        </p>
      )}
    </div>
  )
}
