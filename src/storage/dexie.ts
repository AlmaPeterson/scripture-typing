// IndexedDB implementation of Storage, using Dexie.
// This is the only module in the app that imports Dexie.

import Dexie, { type Table } from 'dexie'
import { accuracy, addTotals, wpm, type KeyStatKind } from '../typing'
import { validateBackup } from './backup'
import type { Storage } from './storage'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  DEFAULT_SETTINGS,
  type Backup,
  type ChapterProgress,
  type DailyTotals,
  type KeyStat,
  type Note,
  type SessionRecord,
  type SettingRecord,
  type Settings,
  type ShelfEntry,
  type VerseCompletion,
  type VerseStat,
} from './types'

class Db extends Dexie {
  shelf!: Table<ShelfEntry, string>
  progress!: Table<ChapterProgress, [string, string, number]>
  notes!: Table<Note, string>
  sessions!: Table<SessionRecord, string>
  verseStats!: Table<VerseStat, [string, string, number, number, string]>
  keyStats!: Table<KeyStat, [string, string]>
  daily!: Table<DailyTotals, string>
  settings!: Table<SettingRecord, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      shelf: 'courseId, order',
      progress: '[courseId+bookId+chapter], courseId, [courseId+bookId]',
      notes: 'id, [courseId+bookId+chapter], courseId',
      sessions: 'id, startedAt, courseId',
      verseStats: '[courseId+bookId+chapter+verse+sessionId], sessionId, courseId, at',
      keyStats: '[kind+key], kind',
      daily: 'date',
      settings: 'key',
    })
  }
}

/** Local calendar date "YYYY-MM-DD" for a timestamp. */
export function localDate(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function noteId(courseId: string, bookId: string, chapter: number, verse: number): string {
  return `${courseId}/${bookId}/${chapter}/${verse}`
}

export class DexieStorage implements Storage {
  private readonly db: Db

  constructor(name = 'scripture-typer') {
    this.db = new Db(name)
  }

  /** Close the database (tests). */
  close() {
    this.db.close()
  }

  // ---- Courses on Home ----

  async getShelf(): Promise<ShelfEntry[]> {
    return this.db.shelf.orderBy('order').toArray()
  }

  async addCourse(courseId: string, now = Date.now()): Promise<ShelfEntry> {
    return this.db.transaction('rw', this.db.shelf, this.db.progress, async () => {
      const existing = await this.db.shelf.get(courseId)
      if (existing) return existing
      const last = await this.db.shelf.orderBy('order').last()
      // A course added back keeps the progress it had.
      const lastPosition = await this.latestPosition(courseId)
      const entry: ShelfEntry = {
        courseId,
        order: last ? last.order + 1 : 0,
        addedAt: now,
        yearlyReset: false,
        progressYear: new Date(now).getFullYear(),
        lastPosition,
        updatedAt: now,
      }
      await this.db.shelf.put(entry)
      return entry
    })
  }

  private async latestPosition(courseId: string) {
    const rows = await this.db.progress.where('courseId').equals(courseId).toArray()
    let best: ChapterProgress | undefined
    for (const r of rows) {
      if (r.lastVerse !== null && (!best || r.updatedAt > best.updatedAt)) best = r
    }
    return best ? { bookId: best.bookId, chapter: best.chapter, verse: best.lastVerse! } : null
  }

  async removeCourse(courseId: string): Promise<void> {
    await this.db.shelf.delete(courseId)
  }

  async setYearlyReset(courseId: string, enabled: boolean): Promise<void> {
    await this.db.shelf.update(courseId, { yearlyReset: enabled, updatedAt: Date.now() })
  }

  async applyYearlyResets(now = new Date()): Promise<string[]> {
    const year = now.getFullYear()
    const reset: string[] = []
    await this.db.transaction('rw', this.db.shelf, this.db.progress, async () => {
      for (const entry of await this.db.shelf.toArray()) {
        if (entry.progressYear >= year) continue
        if (entry.yearlyReset) {
          await this.db.progress.where('courseId').equals(entry.courseId).delete()
          reset.push(entry.courseId)
        }
        // Progress now belongs to this year whether or not it was cleared, so
        // turning the reset on later only takes effect next January 1.
        await this.db.shelf.update(entry.courseId, {
          progressYear: year,
          lastPosition: entry.yearlyReset ? null : entry.lastPosition,
          updatedAt: now.getTime(),
        })
      }
    })
    return reset
  }

  // ---- Progress ----

  async getProgress(courseId: string, bookId?: string): Promise<ChapterProgress[]> {
    if (bookId === undefined) return this.db.progress.where('courseId').equals(courseId).toArray()
    return this.db.progress.where('[courseId+bookId]').equals([courseId, bookId]).toArray()
  }

  async getChapterProgress(courseId: string, bookId: string, chapter: number) {
    return this.db.progress.get([courseId, bookId, chapter])
  }

  // ---- Typing results ----

  async recordVerse(c: VerseCompletion): Promise<void> {
    const { db } = this
    const r = c.result
    const totals = {
      correctChars: r.correctChars,
      keystrokes: r.keystrokes,
      correctKeystrokes: r.correctKeystrokes,
      errors: r.errors,
      activeMs: r.activeMs,
    }
    await db.transaction(
      'rw',
      [db.verseStats, db.sessions, db.progress, db.shelf, db.keyStats, db.daily],
      async () => {
        const at = c.at

        await db.verseStats.put({
          ...totals,
          courseId: c.courseId,
          bookId: c.bookId,
          chapter: c.chapter,
          verse: r.verseNumber,
          sessionId: c.sessionId,
          at,
          wpm: r.wpm,
          accuracy: r.accuracy,
          updatedAt: at,
        })

        const prev = await db.sessions.get(c.sessionId)
        const s = prev ?? {
          id: c.sessionId,
          courseId: c.courseId,
          bookId: c.bookId,
          chapter: c.chapter,
          firstVerse: r.verseNumber,
          lastVerse: r.verseNumber,
          verses: 0,
          startedAt: c.sessionStartedAt,
          endedAt: at,
          correctChars: 0,
          keystrokes: 0,
          correctKeystrokes: 0,
          errors: 0,
          activeMs: 0,
          wpm: 0,
          accuracy: 1,
          completedChapter: false,
          updatedAt: at,
        }
        s.firstVerse = Math.min(s.firstVerse, r.verseNumber)
        s.lastVerse = Math.max(s.lastVerse, r.verseNumber)
        s.verses++
        s.endedAt = at
        s.correctChars += totals.correctChars
        s.keystrokes += totals.keystrokes
        s.correctKeystrokes += totals.correctKeystrokes
        s.errors += totals.errors
        s.activeMs += totals.activeMs
        s.wpm = wpm(s.correctChars, s.activeMs)
        s.accuracy = accuracy(s.correctKeystrokes, s.keystrokes)
        s.completedChapter ||= c.chapterCompleted
        s.updatedAt = at
        await db.sessions.put(s)

        const p = (await db.progress.get([c.courseId, c.bookId, c.chapter])) ?? {
          courseId: c.courseId,
          bookId: c.bookId,
          chapter: c.chapter,
          verseCount: c.verseCount,
          completedVerses: [],
          completed: false,
          completedAt: null,
          lastVerse: null,
          updatedAt: at,
        }
        if (!p.completedVerses.includes(r.verseNumber)) {
          p.completedVerses = [...p.completedVerses, r.verseNumber].sort((a, b) => a - b)
        }
        p.verseCount = c.verseCount
        p.lastVerse = r.verseNumber
        if (c.chapterCompleted) {
          p.completed = true
          p.completedAt = at
        }
        p.updatedAt = at
        await db.progress.put(p)

        const shelf = await db.shelf.get(c.courseId)
        if (shelf) {
          await db.shelf.put({
            ...shelf,
            lastPosition: { bookId: c.bookId, chapter: c.chapter, verse: r.verseNumber },
            updatedAt: at,
          })
        }

        for (const d of c.keyStats) {
          const old = await db.keyStats.get([d.kind, d.key])
          const sum = addTotals(old ?? { count: 0, timedCount: 0, totalMs: 0, errors: 0 }, d)
          await db.keyStats.put({ kind: d.kind, key: d.key, ...sum, updatedAt: at })
        }

        const date = localDate(at)
        const day = (await db.daily.get(date)) ?? {
          date,
          correctChars: 0,
          keystrokes: 0,
          correctKeystrokes: 0,
          errors: 0,
          activeMs: 0,
          verses: 0,
          chaptersCompleted: 0,
          updatedAt: at,
        }
        day.correctChars += totals.correctChars
        day.keystrokes += totals.keystrokes
        day.correctKeystrokes += totals.correctKeystrokes
        day.errors += totals.errors
        day.activeMs += totals.activeMs
        day.verses++
        if (c.chapterCompleted) day.chaptersCompleted++
        day.updatedAt = at
        await db.daily.put(day)
      },
    )
  }

  // ---- Notes ----

  async getNotes(courseId: string, bookId: string, chapter: number): Promise<Note[]> {
    return this.db.notes
      .where('[courseId+bookId+chapter]')
      .equals([courseId, bookId, chapter])
      .toArray()
  }

  async getAllNotes(): Promise<Note[]> {
    return this.db.notes.toArray()
  }

  async saveNote(
    courseId: string,
    bookId: string,
    chapter: number,
    verse: number,
    text: string,
  ): Promise<Note | null> {
    const id = noteId(courseId, bookId, chapter, verse)
    const now = Date.now()
    if (!text.trim()) {
      await this.db.notes.delete(id)
      return null
    }
    return this.db.transaction('rw', this.db.notes, async () => {
      const old = await this.db.notes.get(id)
      const note: Note = {
        id,
        courseId,
        bookId,
        chapter,
        verse,
        text,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
      }
      await this.db.notes.put(note)
      return note
    })
  }

  // ---- Stats ----

  async getSessions(): Promise<SessionRecord[]> {
    return this.db.sessions.orderBy('startedAt').toArray()
  }

  async getVerseStats(courseId?: string): Promise<VerseStat[]> {
    if (courseId === undefined) return this.db.verseStats.toArray()
    return this.db.verseStats.where('courseId').equals(courseId).toArray()
  }

  async getKeyStats(kind?: KeyStatKind): Promise<KeyStat[]> {
    if (kind === undefined) return this.db.keyStats.toArray()
    return this.db.keyStats.where('kind').equals(kind).toArray()
  }

  async getDaily(): Promise<DailyTotals[]> {
    return this.db.daily.orderBy('date').toArray()
  }

  // ---- Settings ----

  async getSettings(): Promise<Settings> {
    const rows = await this.db.settings.toArray()
    const settings: Settings = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      if (row.key in settings) (settings as unknown as Record<string, unknown>)[row.key] = row.value
    }
    return settings
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const now = Date.now()
    await this.db.settings.bulkPut(
      Object.entries(patch).map(([key, value]) => ({ key, value, updatedAt: now })),
    )
    return this.getSettings()
  }

  // ---- Backup ----

  async exportAll(): Promise<Backup> {
    const { db } = this
    return db.transaction('r', db.tables, async () => ({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        shelf: await db.shelf.toArray(),
        progress: await db.progress.toArray(),
        notes: await db.notes.toArray(),
        sessions: await db.sessions.toArray(),
        verseStats: await db.verseStats.toArray(),
        keyStats: await db.keyStats.toArray(),
        daily: await db.daily.toArray(),
        settings: await db.settings.toArray(),
      },
    }))
  }

  async importAll(input: unknown): Promise<void> {
    const { data } = validateBackup(input)
    const { db } = this
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()))
      await db.shelf.bulkPut(data.shelf)
      await db.progress.bulkPut(data.progress)
      await db.notes.bulkPut(data.notes)
      await db.sessions.bulkPut(data.sessions)
      await db.verseStats.bulkPut(data.verseStats)
      await db.keyStats.bulkPut(data.keyStats)
      await db.daily.bulkPut(data.daily)
      await db.settings.bulkPut(data.settings)
    })
  }

  async clearAll(): Promise<void> {
    const { db } = this
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()))
    })
  }
}
