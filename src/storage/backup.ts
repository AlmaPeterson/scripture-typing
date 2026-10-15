// Validation of an exported backup before it replaces the stored data.

import { BACKUP_FORMAT, BACKUP_VERSION, type Backup, type BackupData } from './types'

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

type FieldType = 'string' | 'number' | 'boolean' | 'numbers' | 'position?' | 'number?' | 'any'

const TOTALS: Record<string, FieldType> = {
  correctChars: 'number',
  keystrokes: 'number',
  correctKeystrokes: 'number',
  errors: 'number',
  activeMs: 'number',
}

const SCHEMA: Record<keyof BackupData, Record<string, FieldType>> = {
  shelf: {
    courseId: 'string',
    order: 'number',
    addedAt: 'number',
    yearlyReset: 'boolean',
    progressYear: 'number',
    lastPosition: 'position?',
    updatedAt: 'number',
  },
  progress: {
    courseId: 'string',
    bookId: 'string',
    chapter: 'number',
    verseCount: 'number',
    completedVerses: 'numbers',
    completed: 'boolean',
    completedAt: 'number?',
    lastVerse: 'number?',
    updatedAt: 'number',
  },
  notes: {
    id: 'string',
    courseId: 'string',
    bookId: 'string',
    chapter: 'number',
    verse: 'number',
    text: 'string',
    createdAt: 'number',
    updatedAt: 'number',
  },
  sessions: {
    ...TOTALS,
    id: 'string',
    courseId: 'string',
    bookId: 'string',
    chapter: 'number',
    firstVerse: 'number',
    lastVerse: 'number',
    verses: 'number',
    startedAt: 'number',
    endedAt: 'number',
    wpm: 'number',
    accuracy: 'number',
    completedChapter: 'boolean',
    updatedAt: 'number',
  },
  verseStats: {
    ...TOTALS,
    courseId: 'string',
    bookId: 'string',
    chapter: 'number',
    verse: 'number',
    sessionId: 'string',
    at: 'number',
    wpm: 'number',
    accuracy: 'number',
    updatedAt: 'number',
  },
  keyStats: {
    kind: 'string',
    key: 'string',
    count: 'number',
    timedCount: 'number',
    totalMs: 'number',
    errors: 'number',
    updatedAt: 'number',
  },
  daily: {
    ...TOTALS,
    date: 'string',
    verses: 'number',
    chaptersCompleted: 'number',
    updatedAt: 'number',
  },
  settings: { key: 'string', value: 'any', updatedAt: 'number' },
}

export const STORE_NAMES = Object.keys(SCHEMA) as (keyof BackupData)[]

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function checkField(type: FieldType, v: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof v === 'string'
    case 'number':
      return isNum(v)
    case 'boolean':
      return typeof v === 'boolean'
    case 'numbers':
      return Array.isArray(v) && v.every(isNum)
    case 'number?':
      return v === null || isNum(v)
    case 'position?':
      return (
        v === null ||
        (isObject(v) && typeof v.bookId === 'string' && isNum(v.chapter) && isNum(v.verse))
      )
    case 'any':
      return v !== undefined
  }
}

/** Check that `input` is a backup this version of the app can import. Throws BackupError. */
export function validateBackup(input: unknown): Backup {
  if (!isObject(input) || input.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not a Scripture Typer backup.')
  }
  if (!isNum(input.version) || input.version > BACKUP_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version of the app (format ${String(input.version)}).`,
    )
  }
  if (!isObject(input.data)) throw new BackupError('The backup has no data.')
  const data = input.data
  for (const store of STORE_NAMES) {
    const records = data[store] ?? []
    if (!Array.isArray(records)) throw new BackupError(`"${store}" in the backup is not a list.`)
    records.forEach((r: unknown, i) => {
      if (!isObject(r)) throw new BackupError(`Record ${i + 1} in "${store}" is not an object.`)
      for (const [field, type] of Object.entries(SCHEMA[store])) {
        if (!checkField(type, r[field])) {
          throw new BackupError(`Record ${i + 1} in "${store}" has a missing or bad "${field}".`)
        }
      }
    })
    data[store] = records
  }
  return input as unknown as Backup
}
