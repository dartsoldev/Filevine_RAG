import { useEffect, useRef, useState } from 'react'
import { Composer, type ComposerHandle } from './components/Composer'
import { Starters, Welcome } from './components/EmptyState'
import { MenuIcon } from './components/Icons'
import { Message } from './components/Message'
import { Sidebar } from './components/Sidebar'
import { useChat } from './hooks/useChat'
import { useStickToBottom } from './hooks/useStickToBottom'

export default function App() {
  const chat = useChat()
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const composer = useRef<ComposerHandle>(null)
  const { containerRef, contentRef, pin } = useStickToBottom<HTMLElement, HTMLDivElement>()

  const isEmpty = chat.messages.length === 0

  // Opening a different chat always starts at its latest message.
  useEffect(() => {
    pin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.activeId])

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

  const startNew = () => {
    chat.startNew()
    setDraft('')
    setMenuOpen(false)
    composer.current?.focusAtEnd()
  }

  const openChat = (id: string) => {
    chat.select(id)
    setMenuOpen(false)
  }

  return (
    <div className="shell">
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNew={startNew}
        onSelect={openChat}
        onDelete={chat.remove}
      />

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
          >
            <MenuIcon />
          </button>
          <h1 className="topbar-title">{chat.title ?? 'New chat'}</h1>
        </header>

        {/* The composer stays mounted in both layouts so it never loses focus or its text. */}
        <div className={isEmpty ? 'stage is-empty' : 'stage'}>
          <main className="thread" ref={containerRef}>
            <div className="thread-inner" ref={contentRef}>
              {isEmpty ? (
                <Welcome />
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

          <div className="dock">
            <Composer
              ref={composer}
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              onStop={chat.stop}
              busy={chat.busy}
            />
            {isEmpty ? (
              <Starters onPick={fillStarter} />
            ) : (
              <p className="dock-note">
                Answers come from documents filed in Filevine. Check important details against the
                source.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Screen readers hear each finished answer once, not every printed word. */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {chat.announcement}
      </div>
    </div>
  )
}
