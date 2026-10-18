import { describe, expect, it } from 'vitest'
import type { KeyStat } from '../storage'
import {
  LETTERS,
  addText,
  bestLayout,
  emptyCounts,
  isReady,
  keyTimes,
  keyboardRows,
  layoutCost,
} from './bestLayout'

const stat = (kind: KeyStat['kind'], key: string, timedCount: number, msEach: number): KeyStat => ({
  kind,
  key,
  count: timedCount,
  timedCount,
  totalMs: timedCount * msEach,
  errors: 0,
  updatedAt: 0,
})

/** Every letter timed at 200 ms, except the ones given. */
function letters(fast: Record<string, number> = {}): KeyStat[] {
  return [...LETTERS].map((l) => stat('letter', l, 50, fast[l] ?? 200))
}

describe('addText', () => {
  it('counts word starts and in-word pairs, ignoring case and punctuation', () => {
    const c = emptyCounts()
    addText(c, "The LORD's—the")
    const i = (l: string) => l.charCodeAt(0) - 97
    expect(c.letters).toBe(11)
    expect(c.starts[i('t')]).toBe(2)
    expect(c.starts[i('l')]).toBe(1)
    expect(c.starts[i('s')]).toBe(1)
    expect(c.pairs[i('t') * 26 + i('h')]).toBe(2)
    expect(c.pairs[i('d') * 26 + i('s')]).toBe(0)
  })
})

describe('keyTimes', () => {
  it('blends few samples of a pair with how fast its second key is', () => {
    const t = keyTimes([...letters(), stat('bigram', 'th', 5, 100)])
    const th = 19 * 26 + 7
    expect(t.pair[th]).toBeCloseTo(150) // (5 × 100 + 5 × 200) / 10
    expect(t.measured[th]).toBe(1)
    expect(t.pair[0]).toBeCloseTo(200)
    expect(t.measured[0]).toBe(0)
  })

  it('needs 20 letters timed often enough', () => {
    expect(isReady(keyTimes(letters()))).toBe(true)
    expect(isReady(keyTimes(letters().slice(0, 19)))).toBe(false)
  })
})

describe('bestLayout', () => {
  it('puts the most used letter on the fastest key', () => {
    // The Q key is very fast; the text is mostly "e".
    const times = keyTimes(letters({ q: 50 }))
    const counts = emptyCounts()
    addText(counts, 'e e e e e e e e e a b')
    const r = bestLayout(counts, times)
    expect(r.letterOn[LETTERS.indexOf('q')]).toBe('e')
    expect(r.bestMs).toBeLessThan(r.currentMs)
    expect([...r.letterOn].sort().join('')).toBe(LETTERS)
  })

  it('never does worse than the current layout', () => {
    const times = keyTimes(letters())
    const counts = emptyCounts()
    addText(counts, 'And it came to pass')
    const r = bestLayout(counts, times)
    expect(r.bestMs).toBeCloseTo(r.currentMs)
    const identity = Array.from({ length: 26 }, (_, i) => i)
    expect(layoutCost(counts, times, identity)).toBeCloseTo(r.currentMs)
  })
})

describe('keyboardRows', () => {
  it('lists the letter rows of a layout', () => {
    const rows = keyboardRows('dvorak')
    expect(rows.map((r) => r.map((k) => k.current).join(''))).toEqual([
      "',.pyfgcrl/=\\",
      'aoeuidhtns-',
      ';qjkxbmwvz',
    ])
    expect(rows[1][0]).toEqual({ current: 'a', letterKey: 0 })
    expect(rows[0][0].letterKey).toBe(-1)
  })
})
