// All persistent storage goes through the `Storage` interface below so the
// IndexedDB (Dexie) implementation can later be swapped for, or synced with,
// a server-backed one. Nothing outside src/storage/ should import Dexie.
//
// Placeholder: the record types and the Dexie implementation are filled in
// when the screens are built (see docs/PLAN.md, "Data model").

export interface Storage {
  /** Export every stored record as one JSON-serialisable object (Settings → Export). */
  exportAll(): Promise<unknown>
  /** Replace all stored data with a previously exported backup (Settings → Import). */
  importAll(data: unknown): Promise<void>
}
