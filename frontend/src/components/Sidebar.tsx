import { useEffect } from 'react'
import type { Conversation } from '../types'
import { CloseIcon, PlusIcon, TrashIcon } from './Icons'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string | null
  /** Only matters on small screens, where the sidebar is a drawer. */
  open: boolean
  onClose: () => void
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export function Sidebar({
  conversations,
  activeId,
  open,
  onClose,
  onNew,
  onSelect,
  onDelete,
}: SidebarProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <aside id="sidebar" className={open ? 'sidebar is-open' : 'sidebar'} aria-label="Conversations">
        <div className="sidebar-head">
          <div className="brand">
            <span className="monogram" aria-hidden="true">
              A
            </span>
            <div className="brand-text">
              <span className="brand-name">Aravana Law</span>
              <span className="brand-sub">Case Assistant</span>
            </div>
          </div>
          <button type="button" className="icon-button drawer-close" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>

        <button type="button" className="new-chat" onClick={onNew}>
          <PlusIcon />
          New chat
        </button>

        <nav className="history" aria-labelledby="history-title">
          <h2 id="history-title" className="history-title">
            Recent
          </h2>
          {conversations.length === 0 ? (
            <p className="history-empty">Chats from this session appear here.</p>
          ) : (
            <ul>
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeId
                return (
                  <li key={conversation.id} className={isActive ? 'history-item is-active' : 'history-item'}>
                    <button
                      type="button"
                      className="history-link"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onSelect(conversation.id)}
                      title={conversation.title}
                    >
                      {conversation.title}
                    </button>
                    <button
                      type="button"
                      className="history-delete"
                      aria-label={`Delete chat: ${conversation.title}`}
                      onClick={() => onDelete(conversation.id)}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        <p className="sidebar-foot">Confidential. For Aravana Law staff only.</p>
      </aside>
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}
    </>
  )
}
