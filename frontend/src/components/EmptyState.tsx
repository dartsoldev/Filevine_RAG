interface StartersProps {
  onPick: (text: string) => void
}

/** Each starter ends where the client's name goes; picking one fills the message box. */
const STARTERS = [
  { label: 'Summarise medical records', text: 'Summarise the medical records for ' },
  { label: 'Total on medical bills', text: 'What is the total billed on the medical bills for ' },
  { label: 'Documents on file', text: 'Which documents do we have on file for ' },
  { label: 'Letter of representation', text: 'Summarise the letter of representation for ' },
]

export function Welcome() {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <p className="welcome-eyebrow">Aravana Law</p>
      <h2 id="welcome-title" className="welcome-title">
        What do you need from the case files?
      </h2>
      <p className="welcome-lead">
        Search documents, records and correspondence by client name. Answers cite the files
        they are drawn from.
      </p>
    </section>
  )
}

export function Starters({ onPick }: StartersProps) {
  return (
    <ul className="starters" aria-label="Example questions">
      {STARTERS.map((starter) => (
        <li key={starter.label}>
          <button type="button" className="starter" onClick={() => onPick(starter.text)}>
            {starter.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
