import { useEffect, useRef, useState } from 'react'

/** Slowest printing speed, and the longest an answer may take to finish printing. */
const MIN_CHARS_PER_SECOND = 90
const MAX_DURATION_SECONDS = 7

/**
 * Prints `text` progressively while `active`, word by word, and calls `onDone`
 * when the whole text is shown. Timing is based on elapsed time, so a background
 * tab catches up instead of stalling. Users who prefer reduced motion get the
 * full text at once.
 */
export function useReveal(text: string, active: boolean, onDone: () => void): string {
  const [count, setCount] = useState(active ? 0 : text.length)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!active) {
      setCount(text.length)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(text.length)
      onDoneRef.current()
      return
    }

    const speed = Math.max(MIN_CHARS_PER_SECOND, text.length / MAX_DURATION_SECONDS)
    const startedAt = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const next = Math.min(text.length, Math.floor(((now - startedAt) / 1000) * speed))
      setCount(next)
      if (next >= text.length) {
        onDoneRef.current()
      } else {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text, active])

  if (count >= text.length) return text
  // Stop at a word boundary so half-typed words never flash on screen.
  const boundary = text.lastIndexOf(' ', count)
  const lineBreak = text.lastIndexOf('\n', count)
  return text.slice(0, Math.max(boundary, lineBreak, 0))
}
