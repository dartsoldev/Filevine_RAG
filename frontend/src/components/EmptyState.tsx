interface EmptyStateProps {
  onPick: (text: string) => void
}

/** Each starter ends where the client's name goes; picking one fills the message box. */
const STARTERS = [
  { label: 'Summarise the medical records for a client', text: 'Summarise the medical records for ' },
  { label: 'Find the total billed on a client’s medical bills', text: 'What is the total billed on the medical bills for ' },
  { label: 'List the documents on file for a client', text: 'Which documents do we have on file for ' },
]

export function EmptyState({ onPick }: EmptyStateProps) {
  return (
    <section className="empty" aria-labelledby="empty-title">
      <h2 id="empty-title" className="empty-title">
        Ask about a client or a case file
      </h2>
      <p className="empty-lead">
        Answers come from the documents filed in Filevine. Refer to a client by name; a rough
        spelling is fine, and you will be asked to choose if more than one client matches.
      </p>

      <ul className="starters">
        {STARTERS.map((starter) => (
          <li key={starter.label}>
            <button type="button" className="starter" onClick={() => onPick(starter.text)}>
              <span>{starter.label}</span>
              <span className="starter-arrow" aria-hidden="true">
                &rarr;
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
