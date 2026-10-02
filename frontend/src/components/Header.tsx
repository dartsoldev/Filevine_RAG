interface HeaderProps {
  onNewConversation: () => void
  canReset: boolean
}

export function Header({ onNewConversation, canReset }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <h1 className="brand-name">Case Files Assistant</h1>
      </div>
      <button
        type="button"
        className="button button-quiet"
        onClick={onNewConversation}
        disabled={!canReset}
      >
        New conversation
      </button>
    </header>
  )
}
