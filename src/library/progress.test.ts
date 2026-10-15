import { describe, expect, it } from 'vitest'
import type { ChapterProgress } from '../storage'
import { bookProgress, continueTarget, courseProgress, nextChapter } from './progress'
import type { CourseInfo } from './texts'

const course: CourseInfo = {
  id: 'pearl-of-great-price',
  title: 'Pearl of Great Price',
  books: [
    { id: 'moses', title: 'Moses', unitLabel: 'Chapter', chapters: 2, path: 'x' },
    { id: 'abraham', title: 'Abraham', unitLabel: 'Chapter', chapters: 2, path: 'y' },
  ],
}

function row(
  bookId: string,
  chapter: number,
  completedVerses: number[],
  verseCount: number,
  updatedAt: number,
  completed = false,
): ChapterProgress {
  return {
    courseId: course.id,
    bookId,
    chapter,
    verseCount,
    completedVerses,
    completed,
    completedAt: completed ? updatedAt : null,
    lastVerse: completedVerses.at(-1) ?? null,
    updatedAt,
  }
}

describe('progress', () => {
  it('counts chapters equally and partial chapters by verses', () => {
    const rows = [row('moses', 1, [1, 2, 3, 4], 4, 1, true), row('moses', 2, [1], 4, 2)]
    expect(bookProgress(course.books[0], rows)).toEqual({
      fraction: (1 + 0.25) / 2,
      completedChapters: 1,
      totalChapters: 2,
    })
    expect(courseProgress(course, rows).fraction).toBeCloseTo(1.25 / 4)
    expect(bookProgress(course.books[1], rows).fraction).toBe(0)
  })
})

describe('nextChapter', () => {
  it('moves through a book and on to the next book', () => {
    expect(nextChapter(course, 'moses', 1)).toEqual({ bookId: 'moses', chapter: 2 })
    expect(nextChapter(course, 'moses', 2)).toEqual({ bookId: 'abraham', chapter: 1 })
    expect(nextChapter(course, 'abraham', 2)).toBeNull()
  })
})

describe('continueTarget', () => {
  it('starts at the beginning with no progress', () => {
    expect(continueTarget(course, [])).toEqual({ bookId: 'moses', chapter: 1, after: 0 })
    expect(continueTarget(course, [], 'abraham')).toEqual({
      bookId: 'abraham',
      chapter: 1,
      after: 0,
    })
  })

  it('goes to the verse after the last one completed, across books', () => {
    const rows = [row('moses', 1, [1, 2], 4, 10), row('abraham', 1, [1, 2, 3], 5, 20)]
    expect(continueTarget(course, rows)).toEqual({ bookId: 'abraham', chapter: 1, after: 3 })
    expect(continueTarget(course, rows, 'moses')).toEqual({ bookId: 'moses', chapter: 1, after: 2 })
  })

  it('moves to the next chapter or book after a chapter’s last verse', () => {
    expect(continueTarget(course, [row('moses', 1, [1, 2], 2, 1, true)])).toEqual({
      bookId: 'moses',
      chapter: 2,
      after: 0,
    })
    expect(continueTarget(course, [row('moses', 2, [1, 2], 2, 1, true)])).toEqual({
      bookId: 'abraham',
      chapter: 1,
      after: 0,
    })
  })

  it('after the end of a book (book scope) goes to its first unfinished chapter', () => {
    const rows = [row('moses', 1, [1], 3, 1), row('moses', 2, [1, 2], 2, 5, true)]
    expect(continueTarget(course, rows, 'moses')).toEqual({ bookId: 'moses', chapter: 1, after: 1 })
  })

  it('after finishing everything starts again from the beginning', () => {
    const rows = [
      row('moses', 1, [1], 1, 1, true),
      row('moses', 2, [1], 1, 2, true),
      row('abraham', 1, [1], 1, 3, true),
      row('abraham', 2, [1], 1, 4, true),
    ]
    expect(continueTarget(course, rows)).toEqual({ bookId: 'moses', chapter: 1, after: 0 })
  })
})
