// All persistent storage goes through the `Storage` interface so the
// IndexedDB (Dexie) implementation can later be swapped for, or synced with,
// a server-backed one. Nothing outside src/storage/ imports Dexie.

import { DexieStorage } from './dexie'
import type { Storage } from './storage'

export type { Storage } from './storage'
export * from './types'
export { BackupError, validateBackup } from './backup'
export { localDate } from './dexie'

/** The app's storage. Screens use this through `useStorage()` so tests can swap it. */
export function createStorage(name?: string): Storage {
  return new DexieStorage(name)
}
