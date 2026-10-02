import { useEffect, useRef } from 'react'

const NEAR_BOTTOM_PX = 80

/**
 * Keeps a scroll container pinned to the bottom while its content grows,
 * unless the reader has scrolled up to look at something earlier.
 */
export function useStickToBottom<C extends HTMLElement, I extends HTMLElement>() {
  const containerRef = useRef<C>(null)
  const contentRef = useRef<I>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const onScroll = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight
      pinned.current = distance < NEAR_BOTTOM_PX
    }
    const observer = new ResizeObserver(() => {
      if (pinned.current) container.scrollTop = container.scrollHeight
    })

    container.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    return () => {
      container.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  /** Call when the user sends a message: their own action always scrolls down. */
  const pin = () => {
    pinned.current = true
    const container = containerRef.current
    if (container) container.scrollTop = container.scrollHeight
  }

  return { containerRef, contentRef, pin }
}
