import { describe, expect, it } from 'vitest'
import type { DailyTotals, KeyStat, VerseStat } from '../storage'
import { aggregate, dailyHistory, fingerTotals, rankKeys, slowestFastest } from './statsView'

function vs(
  bookId: string,
  verse: number,
  correctChars: number,
  activeMs: number,
  errors = 0,
): VerseStat {
  return {
    courseId: 'c',
    bookId,
    chapter: 1,
    verse,
    sessionId: 's',
    at: 0,
    correctChars,
    keystrokes: correctChars + errors,
    correctKeystrokes: correctChars,
    errors,
    activeMs,
    wpm: 0,
    accuracy: 1,
    updatedAt: 0,
  }
}

describe('aggregate', () => {
  it('sums verse stats and recomputes WPM and accuracy from totals', () => {
    const [a, b] = aggregate(
      [vs('x', 1, 100, 60000), vs('x', 2, 200, 60000, 10), vs('y', 1, 50, 30000)],
      (r) => r.bookId,
    )
    expect(a).toMatchObject({ key: 'x', verses: 2, correctChars: 300, errors: 10 })
    expect(a.wpm).toBeCloseTo(300 / 5 / 2)
    expect(a.accuracy).toBeCloseTo(300 / 310)
    expect(b.wpm).toBeCloseTo(20)
  })
})

describe('rankKeys', () => {
  const ks = (
    key: string,
    timedCount: number,
    totalMs: number,
    kind: KeyStat['kind'] = 'letter',
  ): KeyStat => ({
    kind,
    key,
    count: timedCount,
    timedCount,
    totalMs,
    errors: 1,
    updatedAt: 0,
  })

  it('sorts slowest first and drops keys with too few samples', () => {
    const ranked = rankKeys(
      [ks('a', 10, 1000), ks('b', 10, 3000), ks('c', 1, 50), ks('th', 10, 10, 'bigram')],
      'letter',
      5,
    )
    expect(ranked.map((r) => r.key)).toEqual(['b', 'a'])
    expect(ranked[1].wpm).toBeCloseTo(120) // 100ms per key
    expect(ranked[0].errorRate).toBeCloseTo(1 / 11)
  })

  it('splits slowest and fastest without overlap', () => {
    const ranked = rankKeys([ks('a', 5, 500), ks('b', 5, 1000), ks('c', 5, 1500)], 'letter', 1)
    const { slowest, fastest } = slowestFastest(ranked, 5)
    expect(slowest.map((r) => r.key)).toEqual(['c', 'b'])
    expect(fastest.map((r) => r.key)).toEqual(['a'])
  })
})

describe('dailyHistory', () => {
  it('keeps the requested range in date order', () => {
    const day = (date: string): DailyTotals => ({
      date,
      correctChars: 500,
      keystrokes: 510,
      correctKeystrokes: 500,
      errors: 10,
      activeMs: 60000,
      verses: 5,
      chaptersCompleted: 0,
      updatedAt: 0,
    })
    const rows = [day('2026-10-14'), day('2026-09-01'), day('2026-10-10')]
    const today = new Date(2026, 9, 14)
    expect(dailyHistory(rows, 7, today).map((d) => d.date)).toEqual(['2026-10-10', '2026-10-14'])
    const all = dailyHistory(rows, null, today)
    expect(all).toHaveLength(3)
    expect(all[0].wpm).toBe(100)
  })
})

describe('fingerTotals', () => {
  const ks = (kind: KeyStat['kind'], key: string, totalMs = 100): KeyStat => ({
    kind,
    key,
    count: 1,
    timedCount: 1,
    totalMs,
    errors: 0,
    updatedAt: 0,
  })
  const stats = [
    ks('letter', 'e'),
    ks('letter', 'k'),
    ks('key', ';'),
    ks('finger', 'thumb', 50),
    ks('finger', 'left-middle', 999),
  ]

  it('maps letters and other keys to fingers for the chosen layout', () => {
    const qwerty = fingerTotals(stats, 'qwerty')
    expect(qwerty.get('left-middle')).toMatchObject({ count: 1, totalMs: 100 })
    expect(qwerty.get('right-middle')).toMatchObject({ count: 1 })
    expect(qwerty.get('right-pinky')).toMatchObject({ count: 1 })
    expect(qwerty.get('thumb')).toMatchObject({ count: 1, totalMs: 50 })

    const dvorak = fingerTotals(stats, 'dvorak')
    // Dvorak: e is the left middle finger's home key, k is the left index, ; the left pinky.
    expect(dvorak.get('left-middle')).toMatchObject({ count: 1 })
    expect(dvorak.get('left-index')).toMatchObject({ count: 1 })
    expect(dvorak.get('left-pinky')).toMatchObject({ count: 1 })
    expect(dvorak.get('right-middle')).toMatchObject({ count: 0 })
  })
})
