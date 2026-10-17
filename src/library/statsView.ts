// Aggregation for the Stats screen. Pure functions over stored records.

import type { DailyTotals, KeyStat, TypingTotals, VerseStat } from '../storage'
import {
  FINGERS,
  accuracy,
  addTotals,
  emptyTotals,
  fingerFor,
  keyStatWpm,
  wpm,
  type Finger,
  type KeyboardLayout,
  type KeyStatKind,
  type KeyStatTotals,
} from '../typing'

export interface Aggregate extends TypingTotals {
  key: string
  /** Verse completions (a verse typed twice counts twice). */
  verses: number
  wpm: number
  accuracy: number
}

/** Sum verse stats grouped by `keyOf`, in first-seen order. */
export function aggregate(rows: VerseStat[], keyOf: (r: VerseStat) => string): Aggregate[] {
  const map = new Map<string, Aggregate>()
  for (const r of rows) {
    const key = keyOf(r)
    let a = map.get(key)
    if (!a) {
      a = {
        key,
        verses: 0,
        correctChars: 0,
        keystrokes: 0,
        correctKeystrokes: 0,
        errors: 0,
        activeMs: 0,
        wpm: 0,
        accuracy: 1,
      }
      map.set(key, a)
    }
    a.verses++
    a.correctChars += r.correctChars
    a.keystrokes += r.keystrokes
    a.correctKeystrokes += r.correctKeystrokes
    a.errors += r.errors
    a.activeMs += r.activeMs
  }
  for (const a of map.values()) {
    a.wpm = wpm(a.correctChars, a.activeMs)
    a.accuracy = accuracy(a.correctKeystrokes, a.keystrokes)
  }
  return [...map.values()]
}

export interface RankedKey {
  key: string
  wpm: number
  /** Share of attempts typed wrong (0..1). */
  errorRate: number
  samples: number
  /** Correct times typed (timed or not). */
  count: number
  errors: number
  /** Average time per timed sample, in ms (a whole word for words). */
  avgMs: number
}

/** Speed of each key stat of a kind, with at least `minSamples` timed samples. */
export function rankKeys(stats: KeyStat[], kind: KeyStatKind, minSamples: number): RankedKey[] {
  return stats
    .filter((s) => s.kind === kind && s.timedCount >= minSamples)
    .map((s) => ({
      key: s.key,
      wpm: keyStatWpm(kind, s.key, s),
      errorRate: s.errors / Math.max(1, s.count + s.errors),
      samples: s.timedCount,
      count: s.count,
      errors: s.errors,
      avgMs: s.totalMs / s.timedCount,
    }))
    .sort((a, b) => a.wpm - b.wpm)
}

/**
 * Per-finger totals for a keyboard layout, worked out from the letter and
 * other-key stats. Space is the thumb on every layout, so the thumb comes from
 * the stored finger stats (other keys were only kept separately from Oct 2026).
 */
export function fingerTotals(stats: KeyStat[], layout: KeyboardLayout): Map<Finger, KeyStatTotals> {
  const out = new Map<Finger, KeyStatTotals>(FINGERS.map((f) => [f, emptyTotals()]))
  for (const s of stats) {
    let finger: Finger | undefined
    if (s.kind === 'letter' || s.kind === 'key') finger = fingerFor(s.key, layout)
    else if (s.kind === 'finger' && s.key === 'thumb') finger = 'thumb'
    if (finger) out.set(finger, addTotals(out.get(finger)!, s))
  }
  return out
}

/** Slowest and fastest `n`, without overlap when there are few items. */
export function slowestFastest(ranked: RankedKey[], n: number) {
  const slowest = ranked.slice(0, Math.min(n, Math.ceil(ranked.length / 2)))
  const fastest = ranked.slice(slowest.length).reverse().slice(0, n)
  return { slowest, fastest }
}

export interface DayPoint extends DailyTotals {
  wpm: number
  accuracy: number
}

/** Daily totals within the last `days` days (all if null), oldest first, days with typing only. */
export function dailyHistory(daily: DailyTotals[], days: number | null, today: Date): DayPoint[] {
  let from = ''
  if (days !== null) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))
    from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return daily
    .filter((d) => d.date >= from && d.activeMs > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      wpm: wpm(d.correctChars, d.activeMs),
      accuracy: accuracy(d.correctKeystrokes, d.keystrokes),
    }))
}

export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
