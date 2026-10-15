// Record types for everything the app stores (docs/PLAN.md, "Data model").
// Every record carries `updatedAt` (ms since epoch) so a future sync can merge.

import type { KeyStatDelta, KeyStatKind, KeyStatTotals, VerseResult } from '../typing'

/** A place in a course: book + chapter + verse (verse = paragraph for Lectures on Faith). */
export interface Position {
  bookId: string
  chapter: number
  verse: number
}

/** A course on Home. */
export interface ShelfEntry {
  courseId: string
  order: number
  addedAt: number
  /** Clear this course's progress on the first open on or after January 1. */
  yearlyReset: boolean
  /** The year the current progress belongs to (used by the yearly reset). */
  progressYear: number
  /** The last verse completed in this course. */
  lastPosition: Position | null
  updatedAt: number
}

/** Progress in one chapter of one book of one course. */
export interface ChapterProgress {
  courseId: string
  bookId: string
  chapter: number
  /** Number of verses in the chapter, so progress can be shown without loading the book. */
  verseCount: number
  /** Verse numbers completed, sorted. */
  completedVerses: number[]
  completed: boolean
  completedAt: number | null
  /** The last verse completed in this chapter. */
  lastVerse: number | null
  updatedAt: number
}

/** A private note on one verse / paragraph. Notes survive yearly resets. */
export interface Note {
  id: string
  courseId: string
  bookId: string
  chapter: number
  verse: number
  text: string
  createdAt: number
  updatedAt: number
}

/** Totals shared by sessions, verse stats and daily history. */
export interface TypingTotals {
  correctChars: number
  keystrokes: number
  correctKeystrokes: number
  errors: number
  activeMs: number
}

/** One visit to the typing view for one chapter. */
export interface SessionRecord extends TypingTotals {
  id: string
  courseId: string
  bookId: string
  chapter: number
  firstVerse: number
  lastVerse: number
  verses: number
  startedAt: number
  endedAt: number
  wpm: number
  accuracy: number
  completedChapter: boolean
  updatedAt: number
}

/** WPM and accuracy for one verse in one session. */
export interface VerseStat extends TypingTotals {
  courseId: string
  bookId: string
  chapter: number
  verse: number
  sessionId: string
  at: number
  wpm: number
  accuracy: number
  updatedAt: number
}

/** Running totals for one letter, bigram, word (5+ letters) or finger. */
export interface KeyStat extends KeyStatTotals {
  kind: KeyStatKind
  key: string
  updatedAt: number
}

/** Totals for one local calendar day ("YYYY-MM-DD"). */
export interface DailyTotals extends TypingTotals {
  date: string
  verses: number
  chaptersCompleted: number
  updatedAt: number
}

export type ScrollStyle = 'smooth' | 'instant' | 'block'
export type Theme = 'system' | 'light' | 'dark'
export type TextSize = 'small' | 'medium' | 'large'

export interface Settings {
  scrollStyle: ScrollStyle
  theme: Theme
  textSize: TextSize
}

export const DEFAULT_SETTINGS: Settings = {
  scrollStyle: 'smooth',
  theme: 'system',
  textSize: 'medium',
}

export interface SettingRecord {
  key: string
  value: unknown
  updatedAt: number
}

/** Everything saved when a verse is completed. */
export interface VerseCompletion {
  sessionId: string
  /** When the session started (ms). */
  sessionStartedAt: number
  courseId: string
  bookId: string
  chapter: number
  verseCount: number
  result: VerseResult
  /** Letter / bigram / word / finger totals collected since the previous verse. */
  keyStats: KeyStatDelta[]
  /** True when this was the last verse of the chapter. */
  chapterCompleted: boolean
  /** When the verse was completed (ms). */
  at: number
}

export const BACKUP_FORMAT = 'scripture-typer-backup'
export const BACKUP_VERSION = 1

export interface BackupData {
  shelf: ShelfEntry[]
  progress: ChapterProgress[]
  notes: Note[]
  sessions: SessionRecord[]
  verseStats: VerseStat[]
  keyStats: KeyStat[]
  daily: DailyTotals[]
  settings: SettingRecord[]
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: BackupData
}
