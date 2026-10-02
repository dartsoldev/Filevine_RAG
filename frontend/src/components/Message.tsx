import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { SLOW_NOTICE_MS } from '../config'
import { useReveal } from '../hooks/useReveal'
import type { ChatMessage } from '../types'
import { CheckIcon, CopyIcon } from './Icons'
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
        <button type="button" className="button-outline" onClick={onRetry}>
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

      {!revealing && (
        <>
          {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
          <div className="actions">
            <CopyButton text={message.text} />
          </div>
        </>
      )}
    </article>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (permissions or insecure context): leave the button as it is.
    }
  }

  return (
    <button type="button" className="action" onClick={copy}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
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
        <span className="pulse" aria-hidden="true" />
        Searching the case files
      </p>
      {slow && (
        <p className="pending-note">
          Still working. If the server was idle it needs up to a minute to start.
        </p>
      )}
    </div>
  )
}
