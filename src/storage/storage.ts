// The Storage interface. Screens and the typing engine use only this; the
// IndexedDB implementation (dexie.ts) can later be replaced by, or synced
// with, a server-backed one.

import type { KeyStatKind } from '../typing'
import type {
  Backup,
  ChapterProgress,
  DailyTotals,
  KeyStat,
  Note,
  SessionRecord,
  Settings,
  ShelfEntry,
  VerseCompletion,
  VerseStat,
} from './types'

export interface Storage {
  // ---- Courses on Home ----
  /** Courses on Home, in display order. */
  getShelf(): Promise<ShelfEntry[]>
  /** Add a course to Home (no-op if it is already there). */
  addCourse(courseId: string, now?: number): Promise<ShelfEntry>
  /** Remove a course from Home. Progress, notes and stats are kept. */
  removeCourse(courseId: string): Promise<void>
  setYearlyReset(courseId: string, enabled: boolean): Promise<void>
  /**
   * Run the yearly January 1 reset: for each course on Home with the reset
   * enabled whose progress is from an earlier year, clear its progress
   * (notes and stats history are kept). Returns the ids of reset courses.
   */
  applyYearlyResets(now?: Date): Promise<string[]>

  // ---- Progress ----
  /** Progress of every chapter touched in a course (optionally one book). */
  getProgress(courseId: string, bookId?: string): Promise<ChapterProgress[]>
  getChapterProgress(
    courseId: string,
    bookId: string,
    chapter: number,
  ): Promise<ChapterProgress | undefined>

  // ---- Typing results ----
  /** Save a completed verse: progress, session, verse stats, key stats and daily totals. */
  recordVerse(completion: VerseCompletion): Promise<void>

  // ---- Notes ----
  getNotes(courseId: string, bookId: string, chapter: number): Promise<Note[]>
  getAllNotes(): Promise<Note[]>
  /** Save the note for a verse. Empty text deletes it. Returns the note, or null if deleted. */
  saveNote(
    courseId: string,
    bookId: string,
    chapter: number,
    verse: number,
    text: string,
  ): Promise<Note | null>

  // ---- Stats ----
  getSessions(): Promise<SessionRecord[]>
  getVerseStats(courseId?: string): Promise<VerseStat[]>
  getKeyStats(kind?: KeyStatKind): Promise<KeyStat[]>
  getDaily(): Promise<DailyTotals[]>

  // ---- Settings ----
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>

  // ---- Backup ----
  /** Export every stored record as one versioned, JSON-serialisable object. */
  exportAll(): Promise<Backup>
  /** Validate a backup and replace all stored data with it. Throws BackupError if invalid. */
  importAll(data: unknown): Promise<void>
  /** Delete all stored data. */
  clearAll(): Promise<void>
}
