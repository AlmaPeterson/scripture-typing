// Course / book progress and "Continue" targets, derived from ChapterProgress rows.

import type { ChapterProgress } from '../storage'
import type { BookInfo, CourseInfo } from './texts'

/** Where to type next: start in `chapter` at the first verse numbered above `after`. */
export interface Target {
  bookId: string
  chapter: number
  after: number
}

export interface ProgressSummary {
  /** 0..1. Each chapter counts equally; a partly typed chapter counts by its verses. */
  fraction: number
  completedChapters: number
  totalChapters: number
}

export function chapterFraction(p: ChapterProgress | undefined): number {
  if (!p) return 0
  if (p.completed) return 1
  if (p.verseCount <= 0) return 0
  return Math.min(1, p.completedVerses.length / p.verseCount)
}

export function progressKey(bookId: string, chapter: number): string {
  return `${bookId}/${chapter}`
}

export function indexProgress(rows: ChapterProgress[]): Map<string, ChapterProgress> {
  return new Map(rows.map((r) => [progressKey(r.bookId, r.chapter), r]))
}

function summarize(books: BookInfo[], rows: ChapterProgress[]): ProgressSummary {
  const ids = new Set(books.map((b) => b.id))
  const totalChapters = books.reduce((n, b) => n + b.chapters, 0)
  let sum = 0
  let completedChapters = 0
  for (const r of rows) {
    if (!ids.has(r.bookId)) continue
    sum += chapterFraction(r)
    if (r.completed) completedChapters++
  }
  return {
    fraction: totalChapters ? sum / totalChapters : 0,
    completedChapters,
    totalChapters,
  }
}

export function bookProgress(book: BookInfo, rows: ChapterProgress[]): ProgressSummary {
  return summarize([book], rows)
}

export function courseProgress(course: CourseInfo, rows: ChapterProgress[]): ProgressSummary {
  return summarize(course.books, rows)
}

/** The chapter after this one, crossing into the next book of the course. */
export function nextChapter(
  course: CourseInfo,
  bookId: string,
  chapter: number,
): { bookId: string; chapter: number } | null {
  const i = course.books.findIndex((b) => b.id === bookId)
  if (i < 0) return null
  if (chapter < course.books[i].chapters) return { bookId, chapter: chapter + 1 }
  const next = course.books[i + 1]
  return next ? { bookId: next.id, chapter: 1 } : null
}

/** The most recently completed verse among `rows`. */
function latest(rows: ChapterProgress[]): ChapterProgress | undefined {
  let best: ChapterProgress | undefined
  for (const r of rows) {
    if (r.lastVerse !== null && (!best || r.updatedAt > best.updatedAt)) best = r
  }
  return best
}

/**
 * Where Continue goes: the verse after the last one completed, in whichever
 * book that was (or within `bookId` if given). With no progress, the start.
 * After the very end, the first unfinished chapter (or the start again).
 */
export function continueTarget(
  course: CourseInfo,
  rows: ChapterProgress[],
  bookId?: string,
): Target | null {
  const books = bookId ? course.books.filter((b) => b.id === bookId) : course.books
  if (books.length === 0) return null
  const scoped = bookId ? rows.filter((r) => r.bookId === bookId) : rows
  const last = latest(scoped)
  if (last && last.lastVerse !== null) {
    if (last.lastVerse < last.verseCount) {
      return { bookId: last.bookId, chapter: last.chapter, after: last.lastVerse }
    }
    const next = nextChapter(course, last.bookId, last.chapter)
    if (next && (!bookId || next.bookId === bookId)) return { ...next, after: 0 }
  }
  if (!last) return { bookId: books[0].id, chapter: 1, after: 0 }
  // Reached the end: go to the first chapter that is not finished.
  const byKey = indexProgress(scoped)
  for (const b of books) {
    for (let ch = 1; ch <= b.chapters; ch++) {
      const p = byKey.get(progressKey(b.id, ch))
      if (!p?.completed) return { bookId: b.id, chapter: ch, after: p?.lastVerse ?? 0 }
    }
  }
  return { bookId: books[0].id, chapter: 1, after: 0 }
}
