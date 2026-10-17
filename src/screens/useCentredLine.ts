import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ScrollStyle } from '../storage'

interface Options {
  /** The scripture text; the current character is marked with `data-caret`. */
  textRef: RefObject<HTMLElement | null>
  /** The sticky stats bar at the top of the window. */
  barRef: RefObject<HTMLElement | null>
  /** Changes whenever the caret may have moved. */
  tick: number
  finished: boolean
  scrollStyle: ScrollStyle
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Keeps the line being typed in the vertical centre of the space below the
 * stats bar, so the text already typed is readable above it and the text to
 * come below it. The window scrolls when the caret moves to a new line (or,
 * for the "block" style, when it drifts too far below the centre). The
 * `.scripture` padding in index.css gives the first and last lines room to
 * reach the centre; with the "top" start there is no room above the first
 * line, so the window stays at the top (scrollTo is clamped to 0) until the
 * line being typed gets down to the centre.
 */
export function useCentredLine({ textRef, barRef, tick, finished, scrollStyle }: Options) {
  const lastLineTop = useRef<number | null>(null)
  const [resized, setResized] = useState(0)

  useLayoutEffect(() => {
    if (finished) return
    const caret = textRef.current?.querySelector<HTMLElement>('[data-caret]')
    if (!caret) return
    const top = caret.offsetTop
    if (top === lastLineTop.current) return
    const first = lastLineTop.current === null
    lastLineTop.current = top

    const rect = caret.getBoundingClientRect()
    const lineCentre = rect.top + rect.height / 2
    // The bar is sticky, so once the page has scrolled its height is what
    // covers the top of the window.
    const barHeight = barRef.current?.offsetHeight ?? 0
    const viewHeight = window.innerHeight
    const centre = barHeight + (viewHeight - barHeight) / 2

    let target = centre
    if (scrollStyle === 'block') {
      // Let the line move down a few lines, then jump a block so it sits
      // above the centre again.
      const lineHeight = parseFloat(getComputedStyle(caret).lineHeight) || rect.height || 30
      const band = Math.max(lineHeight * 1.5, (viewHeight - barHeight) * 0.2)
      if (!first) {
        const tooLow = lineCentre > centre + band
        const tooHigh = lineCentre < barHeight + lineHeight
        if (!tooLow && !tooHigh) return
      }
      target = first ? centre : centre - band
    }

    const delta = lineCentre - target
    if (Math.abs(delta) < 2) return
    const smooth = scrollStyle === 'smooth' && !first && !prefersReducedMotion()
    // An absolute position, so a new line during a smooth scroll does not
    // lose the rest of the previous one.
    window.scrollTo({
      top: Math.max(0, window.scrollY + delta),
      behavior: smooth ? 'smooth' : 'auto',
    })
  }, [textRef, barRef, tick, finished, scrollStyle, resized])

  // Re-centre after the window is resized (lines re-wrap, the centre moves).
  useEffect(() => {
    const onResize = () => {
      lastLineTop.current = null
      setResized((n) => n + 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
}
