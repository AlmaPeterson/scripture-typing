// Loading the scripture JSON from public/texts/ (see docs/TEXTS.md).

export interface BookInfo {
  id: string
  title: string
  unitLabel: string
  /** Number of chapters / sections / lectures. */
  chapters: number
  path: string
  draft?: boolean
}

export interface CourseInfo {
  id: string
  title: string
  books: BookInfo[]
}

export interface LibraryIndex {
  courses: CourseInfo[]
}

export interface Verse {
  number: number
  text: string
}

export interface Chapter {
  number: number
  verses: Verse[]
}

export interface Book {
  id: string
  title: string
  volume: string
  unitLabel: string
  chapters: Chapter[]
}

/** Cache Storage name shared with the service worker's runtime route (vite.config.ts). */
export const TEXTS_CACHE = 'scripture-texts'

export function textUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

async function fetchJson<T>(url: string): Promise<T> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } catch (err) {
    // Offline before the service worker controls the page: try the cache directly.
    if (typeof caches !== 'undefined') {
      const cached = await caches.match(url).catch(() => undefined)
      if (cached) return (await cached.json()) as T
    }
    throw err
  }
}

let indexPromise: Promise<LibraryIndex> | null = null
const bookPromises = new Map<string, Promise<Book>>()

export function loadIndex(): Promise<LibraryIndex> {
  if (!indexPromise) {
    indexPromise = fetchJson<LibraryIndex>(textUrl('texts/index.json')).catch((err) => {
      indexPromise = null
      throw err
    })
  }
  return indexPromise
}

export function loadBook(book: BookInfo): Promise<Book> {
  let p = bookPromises.get(book.path)
  if (!p) {
    p = fetchJson<Book>(textUrl(book.path)).catch((err) => {
      bookPromises.delete(book.path)
      throw err
    })
    bookPromises.set(book.path, p)
  }
  return p
}

/** Forget loaded texts (tests). */
export function resetTextCache() {
  indexPromise = null
  bookPromises.clear()
}

export function findCourse(index: LibraryIndex, courseId: string): CourseInfo | undefined {
  return index.courses.find((c) => c.id === courseId)
}

export function findBook(course: CourseInfo, bookId: string): BookInfo | undefined {
  return course.books.find((b) => b.id === bookId)
}

/** Lower-case unit label for sentences ("chapter", "section", "lecture"). */
export function unitName(book: BookInfo | Book, plural = false): string {
  const name = book.unitLabel.toLowerCase()
  return plural ? `${name}s` : name
}

/**
 * Download every book of a course into Cache Storage so it works offline.
 * Calls `onProgress(done, total)` as books arrive.
 */
export async function prefetchCourse(
  course: CourseInfo,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const urls = course.books.map((b) => textUrl(b.path))
  let done = 0
  const cache = typeof caches !== 'undefined' ? await caches.open(TEXTS_CACHE) : null
  const queue = [...urls]
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      if (cache) {
        if (!(await cache.match(url))) await cache.add(url)
      } else {
        await fetch(url)
      }
      onProgress?.(++done, urls.length)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}

/** Whether every book of a course is in Cache Storage. */
export async function isCourseCached(course: CourseInfo): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  const cache = await caches.open(TEXTS_CACHE)
  for (const b of course.books) {
    if (!(await cache.match(textUrl(b.path)))) return false
  }
  return true
}
