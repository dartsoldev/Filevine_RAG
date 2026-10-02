import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { ArrowUpIcon, StopIcon } from './Icons'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  busy: boolean
}

export interface ComposerHandle {
  focusAtEnd: () => void
}

const MAX_HEIGHT_PX = 200

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { value, onChange, onSubmit, onStop, busy },
  ref,
) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focusAtEnd() {
      // Wait a frame so the new value is in the DOM before placing the caret.
      requestAnimationFrame(() => {
        const element = textarea.current
        if (!element) return
        element.focus()
        element.setSelectionRange(element.value.length, element.value.length)
      })
    },
  }))

  // Grow with the text up to a limit, then scroll inside the box.
  useLayoutEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [value])

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: do not send while an IME (e.g. Urdu, Chinese input) is mid-word.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <label htmlFor="question" className="visually-hidden">
        Your question. Press Enter to send, Shift and Enter for a new line.
      </label>
      <textarea
        id="question"
        ref={textarea}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about a client or case"
        dir="auto"
        autoFocus
      />
      {busy ? (
        <button type="button" className="send" onClick={onStop} aria-label="Stop">
          <StopIcon />
        </button>
      ) : (
        <button type="submit" className="send" disabled={!value.trim()} aria-label="Send message">
          <ArrowUpIcon />
        </button>
      )}
    </form>
  )
})
