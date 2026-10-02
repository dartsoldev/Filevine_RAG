import type { Source } from '../types'

interface SourcesProps {
  sources: Source[]
}

export function Sources({ sources }: SourcesProps) {
  return (
    <section className="sources" aria-label="Sources used for this answer">
      <h3 className="sources-title">Sources</h3>
      <ul>
        {sources.map((source, index) => {
          const details = [
            source.doc_type,
            source.client_name,
            source.case_id ? `Case ${source.case_id}` : null,
          ].filter(Boolean)

          return (
            <li key={`${source.filename}-${source.case_id}-${index}`} className="source">
              <span className="source-file">{source.filename ?? 'Untitled document'}</span>
              {details.length > 0 && <span className="source-meta">{details.join(' · ')}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
