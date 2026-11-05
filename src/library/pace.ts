// Yearly pace for a course: how many verses a day to type it in a year, and
// where to be today to keep up with typing it from January 1 to December 31.

import type { ChapterProgress, Position } from '../storage'
import { indexProgress, progressKey } from './progress'
import type { CourseInfo } from './texts'

export interface YearPace {
  /** Verses (paragraphs for Lectures on Faith) in the course. */
  total: number
  /** Verses completed. */
  done: number
  /** Verses a day to type the whole course in a year, rounded up. */
  perDayYear: number
  /** Verses a day, from today, to finish what is left by December 31, rounded up. */
  perDayRest: number
  /** Days left in the year, today included. */
  daysLeft: number
  /** Verses that should be done by the end of today to keep up this year. */
  target: number
  /** The verse to have reached by the end of today, or null before the first. */
  targetPosition: Position | null
  /** Verses ahead of `target` (negative when behind). */
  ahead: number
}

/** Verses completed in a course. A completed chapter counts all its verses. */
export function versesDone(course: CourseInfo, rows: ChapterProgress[]): number {
  const byKey = indexProgress(rows)
  let n = 0
  for (const b of course.books) {
    for (let ch = 1; ch <= b.chapters; ch++) {
      const p = byKey.get(progressKey(b.id, ch))
      if (!p) continue
      const count = b.verses[ch - 1] ?? p.verseCount
      n += p.completed ? count : Math.min(count, p.completedVerses.length)
    }
  }
  return n
}

/** The `n`th verse of the course, counting from 1, or null if out of range. */
export function nthVerse(course: CourseInfo, n: number): Position | null {
  if (n < 1) return null
  let left = n
  for (const b of course.books) {
    for (let ch = 1; ch <= b.chapters; ch++) {
      const count = b.verses[ch - 1] ?? 0
      if (left <= count) return { bookId: b.id, chapter: ch, verse: left }
      left -= count
    }
  }
  return null
}

export function yearPace(course: CourseInfo, rows: ChapterProgress[], today: Date): YearPace {
  const total = course.books.reduce((n, b) => n + b.verses.reduce((m, v) => m + v, 0), 0)
  const done = Math.min(total, versesDone(course, rows))
  const year = today.getFullYear()
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000
  const day =
    (Date.UTC(year, today.getMonth(), today.getDate()) - Date.UTC(year, 0, 1)) / 86400000 + 1
  const daysLeft = daysInYear - day + 1
  const target = Math.ceil((total * day) / daysInYear)
  return {
    total,
    done,
    perDayYear: Math.ceil(total / daysInYear),
    perDayRest: Math.ceil((total - done) / daysLeft),
    daysLeft,
    target,
    targetPosition: nthVerse(course, target),
    ahead: done - target,
  }
}
