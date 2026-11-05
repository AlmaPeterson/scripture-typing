import { describe, expect, it } from 'vitest'
import type { ChapterProgress } from '../storage'
import { nthVerse, versesDone, yearPace } from './pace'
import type { CourseInfo } from './texts'

// 365 verses over 2 books, so a non-leap year is one verse a day.
const course: CourseInfo = {
  id: 'c',
  title: 'C',
  books: [
    { id: 'a', title: 'A', unitLabel: 'Chapter', chapters: 2, verses: [100, 100], path: 'a' },
    { id: 'b', title: 'B', unitLabel: 'Chapter', chapters: 1, verses: [165], path: 'b' },
  ],
}

function row(bookId: string, chapter: number, verses: number, completed = false): ChapterProgress {
  const count = course.books.find((b) => b.id === bookId)!.verses![chapter - 1]
  return {
    courseId: 'c',
    bookId,
    chapter,
    verseCount: count,
    completedVerses: Array.from({ length: verses }, (_, i) => i + 1),
    completed,
    completedAt: null,
    lastVerse: verses || null,
    updatedAt: 0,
  }
}

describe('versesDone', () => {
  it('counts completed chapters whole and others by their verses', () => {
    expect(versesDone(course, [row('a', 1, 3, true), row('b', 1, 10)])).toBe(110)
  })
})

describe('nthVerse', () => {
  it('walks across chapters and books', () => {
    expect(nthVerse(course, 0)).toBeNull()
    expect(nthVerse(course, 1)).toEqual({ bookId: 'a', chapter: 1, verse: 1 })
    expect(nthVerse(course, 150)).toEqual({ bookId: 'a', chapter: 2, verse: 50 })
    expect(nthVerse(course, 365)).toEqual({ bookId: 'b', chapter: 1, verse: 165 })
    expect(nthVerse(course, 366)).toBeNull()
  })
})

describe('yearPace', () => {
  it('works out the daily verses and where to be today', () => {
    // February 10: day 41 of 365.
    const pace = yearPace(course, [row('a', 1, 30)], new Date(2026, 1, 10))
    expect(pace).toMatchObject({
      total: 365,
      done: 30,
      perDayYear: 1,
      daysLeft: 325,
      perDayRest: 2, // 335 left over 325 days, rounded up
      target: 41,
      targetPosition: { bookId: 'a', chapter: 1, verse: 41 },
      ahead: -11,
    })
  })

  it('gives no pace when the library index has no verse counts', () => {
    const old = { ...course, books: course.books.map((b) => ({ ...b, verses: undefined })) }
    expect(yearPace(old, [], new Date(2026, 1, 10))).toBeNull()
  })

  it('rounds up and uses 366 days in a leap year', () => {
    const pace = yearPace(course, [], new Date(2028, 0, 1))
    expect(pace).toMatchObject({ perDayYear: 1, daysLeft: 366, target: 1, ahead: -1 })
    const end = yearPace(course, [], new Date(2028, 11, 31))
    expect(end).toMatchObject({ daysLeft: 1, perDayRest: 365, target: 365 })
  })
})
