import { useRef, useState } from 'react'
import { Composer, type ComposerHandle } from './components/Composer'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { Message } from './components/Message'
import { useChat } from './hooks/useChat'
import { useStickToBottom } from './hooks/useStickToBottom'

export default function App() {
  const chat = useChat()
  const [draft, setDraft] = useState('')
  const composer = useRef<ComposerHandle>(null)
  const { containerRef, contentRef, pin } = useStickToBottom<HTMLElement, HTMLDivElement>()

  const submit = () => {
    if (!draft.trim() || chat.busy) return
    chat.send(draft)
    setDraft('')
    pin()
  }

  /** Starter prompts end where the client's name goes, so we fill the box and wait. */
  const fillStarter = (text: string) => {
    setDraft(text)
    composer.current?.focusAtEnd()
  }

  const startOver = () => {
    chat.reset()
    setDraft('')
    composer.current?.focusAtEnd()
  }

  return (
    <div className="app">
      <Header onNewConversation={startOver} canReset={chat.messages.length > 0} />

      <main className="thread" ref={containerRef}>
        <div className="thread-inner" ref={contentRef}>
          {chat.messages.length === 0 ? (
            <EmptyState onPick={fillStarter} />
          ) : (
            chat.messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                onRevealed={chat.finishReveal}
                onRetry={chat.retry}
              />
            ))
          )}
        </div>
      </main>

      <Composer
        ref={composer}
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        onStop={chat.stop}
        busy={chat.busy}
      />

      {/* Screen readers hear each finished answer once, not every printed word. */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {chat.announcement}
      </div>
    </div>
  )
}
