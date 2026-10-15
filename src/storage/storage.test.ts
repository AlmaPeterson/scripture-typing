import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VerseResult } from '../typing'
import { BackupError } from './backup'
import { DexieStorage, localDate } from './dexie'
import { BACKUP_FORMAT, DEFAULT_SETTINGS, type VerseCompletion } from './types'

let n = 0
let storage: DexieStorage

beforeEach(() => {
  storage = new DexieStorage(`test-${++n}`)
})

afterEach(() => {
  storage.close()
})

function result(verseNumber: number, over: Partial<VerseResult> = {}): VerseResult {
  return {
    verseIndex: verseNumber - 1,
    verseNumber,
    correctChars: 50,
    keystrokes: 52,
    correctKeystrokes: 50,
    errors: 2,
    activeMs: 10000,
    wpm: 60,
    accuracy: 50 / 52,
    ...over,
  }
}

function completion(over: Partial<VerseCompletion> & { verse?: number } = {}): VerseCompletion {
  const { verse = 1, ...rest } = over
  return {
    sessionId: 's1',
    sessionStartedAt: Date.UTC(2026, 2, 1, 12),
    courseId: 'old-testament',
    bookId: 'genesis',
    chapter: 1,
    verseCount: 3,
    result: result(verse),
    keyStats: [],
    chapterCompleted: false,
    at: Date.UTC(2026, 2, 1, 12, 5),
    ...rest,
  }
}

describe('shelf', () => {
  it('adds courses in order and does not duplicate', async () => {
    await storage.addCourse('book-of-mormon')
    await storage.addCourse('old-testament')
    await storage.addCourse('book-of-mormon')
    const shelf = await storage.getShelf()
    expect(shelf.map((s) => s.courseId)).toEqual(['book-of-mormon', 'old-testament'])
    expect(shelf[0]).toMatchObject({ yearlyReset: false, lastPosition: null, order: 0 })
    expect(shelf[1].order).toBe(1)
  })

  it('removes a course but keeps its progress and notes', async () => {
    await storage.addCourse('old-testament')
    await storage.recordVerse(completion())
    await storage.saveNote('old-testament', 'genesis', 1, 1, 'Creation')
    await storage.removeCourse('old-testament')
    expect(await storage.getShelf()).toEqual([])
    expect(await storage.getProgress('old-testament')).toHaveLength(1)
    expect(await storage.getAllNotes()).toHaveLength(1)
    const again = await storage.addCourse('old-testament')
    expect(again.lastPosition).toEqual({ bookId: 'genesis', chapter: 1, verse: 1 })
  })
})

describe('recordVerse', () => {
  it('saves progress, last position, session, verse stats and daily totals', async () => {
    await storage.addCourse('old-testament')
    await storage.recordVerse(completion({ verse: 1 }))
    await storage.recordVerse(
      completion({ verse: 2, at: Date.UTC(2026, 2, 1, 12, 6), result: result(2, { errors: 0 }) }),
    )

    const p = await storage.getChapterProgress('old-testament', 'genesis', 1)
    expect(p).toMatchObject({
      completedVerses: [1, 2],
      completed: false,
      lastVerse: 2,
      verseCount: 3,
    })

    const [shelf] = await storage.getShelf()
    expect(shelf.lastPosition).toEqual({ bookId: 'genesis', chapter: 1, verse: 2 })

    const [session] = await storage.getSessions()
    expect(session).toMatchObject({
      id: 's1',
      firstVerse: 1,
      lastVerse: 2,
      verses: 2,
      correctChars: 100,
      keystrokes: 104,
      errors: 2,
      activeMs: 20000,
      completedChapter: false,
    })
    expect(session.wpm).toBeCloseTo(60)
    expect(session.accuracy).toBeCloseTo(100 / 104)

    const vs = await storage.getVerseStats('old-testament')
    expect(vs.map((v) => v.verse).sort()).toEqual([1, 2])

    const daily = await storage.getDaily()
    expect(daily).toHaveLength(1)
    expect(daily[0]).toMatchObject({
      date: localDate(Date.UTC(2026, 2, 1, 12, 5)),
      verses: 2,
      correctChars: 100,
      chaptersCompleted: 0,
    })
  })

  it('marks the chapter complete on its last verse', async () => {
    await storage.recordVerse(completion({ verse: 3, chapterCompleted: true }))
    const p = await storage.getChapterProgress('old-testament', 'genesis', 1)
    expect(p?.completed).toBe(true)
    expect(p?.completedAt).not.toBeNull()
    const [day] = await storage.getDaily()
    expect(day.chaptersCompleted).toBe(1)
    const [s] = await storage.getSessions()
    expect(s.completedChapter).toBe(true)
  })

  it('keeps book ids apart across courses', async () => {
    await storage.recordVerse(completion({ courseId: 'old-testament' }))
    await storage.recordVerse(completion({ courseId: 'jst-old-testament', sessionId: 's2' }))
    expect(await storage.getProgress('old-testament', 'genesis')).toHaveLength(1)
    expect(await storage.getProgress('jst-old-testament', 'genesis')).toHaveLength(1)
    expect(await storage.getVerseStats('jst-old-testament')).toHaveLength(1)
  })

  it('adds up key stats', async () => {
    const keyStats = [
      { kind: 'letter' as const, key: 'a', count: 2, timedCount: 1, totalMs: 100, errors: 1 },
      { kind: 'word' as const, key: 'beginning', count: 1, timedCount: 1, totalMs: 900, errors: 0 },
    ]
    await storage.recordVerse(completion({ keyStats }))
    await storage.recordVerse(completion({ verse: 2, keyStats }))
    const letters = await storage.getKeyStats('letter')
    expect(letters).toEqual([
      expect.objectContaining({ key: 'a', count: 4, timedCount: 2, totalMs: 200, errors: 2 }),
    ])
    expect(await storage.getKeyStats()).toHaveLength(2)
  })
})

describe('notes', () => {
  it('saves, updates and deletes a note per verse', async () => {
    const a = await storage.saveNote('book-of-mormon', '1-nephi', 3, 7, 'I will go and do')
    expect(a?.text).toBe('I will go and do')
    const b = await storage.saveNote('book-of-mormon', '1-nephi', 3, 7, 'Go and do.')
    expect(b?.createdAt).toBe(a?.createdAt)
    expect(await storage.getNotes('book-of-mormon', '1-nephi', 3)).toEqual([
      expect.objectContaining({ verse: 7, text: 'Go and do.' }),
    ])
    expect(await storage.saveNote('book-of-mormon', '1-nephi', 3, 7, '  ')).toBeNull()
    expect(await storage.getNotes('book-of-mormon', '1-nephi', 3)).toEqual([])
  })
})

describe('settings', () => {
  it('returns defaults and saves changes', async () => {
    expect(await storage.getSettings()).toEqual(DEFAULT_SETTINGS)
    const s = await storage.updateSettings({ scrollStyle: 'block', theme: 'dark' })
    expect(s).toEqual({ ...DEFAULT_SETTINGS, scrollStyle: 'block', theme: 'dark' })
    expect(await storage.getSettings()).toEqual(s)
  })
})

describe('yearly reset', () => {
  it('clears progress on the first open on or after January 1, keeping notes and stats', async () => {
    await storage.addCourse('book-of-mormon', new Date(2026, 5, 1).getTime())
    await storage.addCourse('old-testament', new Date(2026, 5, 1).getTime())
    await storage.setYearlyReset('book-of-mormon', true)
    await storage.recordVerse(completion({ courseId: 'book-of-mormon', bookId: '1-nephi' }))
    await storage.recordVerse(completion({ courseId: 'old-testament', sessionId: 's2' }))
    await storage.saveNote('book-of-mormon', '1-nephi', 1, 1, 'Goodly parents')

    // Still the same year: nothing happens.
    expect(await storage.applyYearlyResets(new Date(2026, 11, 31, 23, 59))).toEqual([])
    expect(await storage.getProgress('book-of-mormon')).toHaveLength(1)

    // January 1: only the course with the reset enabled is cleared.
    expect(await storage.applyYearlyResets(new Date(2027, 0, 1, 0, 1))).toEqual(['book-of-mormon'])
    expect(await storage.getProgress('book-of-mormon')).toEqual([])
    expect(await storage.getProgress('old-testament')).toHaveLength(1)
    const shelf = await storage.getShelf()
    expect(shelf.find((s) => s.courseId === 'book-of-mormon')?.lastPosition).toBeNull()
    expect(shelf.find((s) => s.courseId === 'old-testament')?.lastPosition).not.toBeNull()
    expect(await storage.getAllNotes()).toHaveLength(1)
    expect(await storage.getVerseStats('book-of-mormon')).toHaveLength(1)
    expect(await storage.getSessions()).toHaveLength(2)

    // Only once per year.
    await storage.recordVerse(completion({ courseId: 'book-of-mormon', bookId: '1-nephi' }))
    expect(await storage.applyYearlyResets(new Date(2027, 3, 1))).toEqual([])
    expect(await storage.getProgress('book-of-mormon')).toHaveLength(1)
  })

  it('turning the reset on mid-year does not clear progress until next January', async () => {
    await storage.addCourse('book-of-mormon', new Date(2026, 5, 1).getTime())
    await storage.recordVerse(completion({ courseId: 'book-of-mormon' }))
    await storage.applyYearlyResets(new Date(2027, 1, 1)) // reset off: nothing cleared
    await storage.setYearlyReset('book-of-mormon', true)
    expect(await storage.applyYearlyResets(new Date(2027, 2, 1))).toEqual([])
    expect(await storage.getProgress('book-of-mormon')).toHaveLength(1)
    expect(await storage.applyYearlyResets(new Date(2028, 0, 2))).toEqual(['book-of-mormon'])
  })
})

describe('export / import', () => {
  it('round-trips all data through JSON', async () => {
    await storage.addCourse('old-testament')
    await storage.recordVerse(
      completion({
        keyStats: [{ kind: 'bigram', key: 'th', count: 1, timedCount: 1, totalMs: 90, errors: 0 }],
      }),
    )
    await storage.saveNote('old-testament', 'genesis', 1, 1, 'Light')
    await storage.updateSettings({ theme: 'dark' })

    const backup = await storage.exportAll()
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(1)
    const json = JSON.stringify(backup)

    await storage.clearAll()
    expect(await storage.getShelf()).toEqual([])
    expect(await storage.getAllNotes()).toEqual([])
    expect((await storage.getSettings()).theme).toBe('system')

    await storage.importAll(JSON.parse(json))
    const again = await storage.exportAll()
    expect(again.data).toEqual(backup.data)
    expect((await storage.getSettings()).theme).toBe('dark')
  })

  it('rejects files that are not valid backups and keeps existing data', async () => {
    await storage.addCourse('old-testament')
    await expect(storage.importAll({ hello: 1 })).rejects.toBeInstanceOf(BackupError)
    await expect(
      storage.importAll({ format: BACKUP_FORMAT, version: 99, data: {} }),
    ).rejects.toThrow(/newer version/)
    await expect(
      storage.importAll({
        format: BACKUP_FORMAT,
        version: 1,
        data: { shelf: [{ courseId: 5 }] },
      }),
    ).rejects.toThrow(/courseId/)
    expect(await storage.getShelf()).toHaveLength(1)
  })

  it('accepts a backup with missing stores as empty', async () => {
    await storage.addCourse('old-testament')
    await storage.importAll({ format: BACKUP_FORMAT, version: 1, data: { notes: [] } })
    expect(await storage.getShelf()).toEqual([])
  })
})
