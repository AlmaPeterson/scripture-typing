// Stats maths shared by the typing engine and the Stats screen.

/** Pauses longer than this are not counted as typing time. */
export const IDLE_THRESHOLD_MS = 5000

/** Words per minute: (correct characters / 5) / active minutes. */
export function wpm(correctChars: number, activeMs: number): number {
  if (activeMs <= 0) return 0
  return correctChars / 5 / (activeMs / 60000)
}

/** Accuracy as a fraction 0..1: correct keystrokes / all character keystrokes. */
export function accuracy(correctKeystrokes: number, keystrokes: number): number {
  if (keystrokes <= 0) return 1
  return correctKeystrokes / keystrokes
}

/** Typing speed in WPM for a key, bigram or word from its average time per character. */
export function msPerCharToWpm(msPerChar: number): number {
  if (msPerChar <= 0) return 0
  return 60000 / msPerChar / 5
}

export type KeyStatKind = 'letter' | 'bigram' | 'word' | 'finger'

/** Running totals for one letter, bigram, word (5+ letters) or finger. */
export interface KeyStatTotals {
  /** Correct keystrokes (or completed words). */
  count: number
  /** How many of those had a usable timing (no long pause before them). */
  timedCount: number
  /** Total time of the timed samples, in ms. For words, the whole word. */
  totalMs: number
  /** Wrong keystrokes where this was expected (or words typed with a mistake). */
  errors: number
}

export interface KeyStatDelta extends KeyStatTotals {
  kind: KeyStatKind
  key: string
}

/** Average speed of a key stat in WPM-equivalent. Words are scaled by their length. */
export function keyStatWpm(kind: KeyStatKind, key: string, s: KeyStatTotals): number {
  if (s.timedCount === 0) return 0
  const avg = s.totalMs / s.timedCount
  // A bigram's time is for its second letter only; a word's is for all its letters.
  const chars = kind === 'word' ? key.length : 1
  return msPerCharToWpm(avg / chars)
}

export function emptyTotals(): KeyStatTotals {
  return { count: 0, timedCount: 0, totalMs: 0, errors: 0 }
}

export function addTotals(a: KeyStatTotals, b: KeyStatTotals): KeyStatTotals {
  return {
    count: a.count + b.count,
    timedCount: a.timedCount + b.timedCount,
    totalMs: a.totalMs + b.totalMs,
    errors: a.errors + b.errors,
  }
}
