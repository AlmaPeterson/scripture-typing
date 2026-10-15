// A tiny hash router. Hash URLs (#/library) work under the GitHub Pages
// sub-path and offline without any server rewrites.

import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'course'; courseId: string }
  | { name: 'book'; courseId: string; bookId: string }
  | {
      name: 'typing'
      courseId: string
      bookId: string
      chapter: number
      /** Start at the first verse numbered above this. */
      after: number | null
    }
  | { name: 'notFound' }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [pathPart, query = ''] = raw.split('?')
  const parts = pathPart
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p))
  const params = new URLSearchParams(query)
  if (parts.length === 0) return { name: 'home' }
  const [first, courseId, bookId, chapter] = parts
  if (parts.length === 1) {
    if (first === 'library') return { name: 'library' }
    if (first === 'stats') return { name: 'stats' }
    if (first === 'settings') return { name: 'settings' }
  }
  if (first === 'c' && courseId) {
    if (parts.length === 2) return { name: 'course', courseId }
    if (parts.length === 3) return { name: 'book', courseId, bookId }
    const n = Number(chapter)
    if (parts.length === 4 && Number.isInteger(n) && n > 0) {
      const after = params.get('after')
      return {
        name: 'typing',
        courseId,
        bookId,
        chapter: n,
        after:
          after !== null && after !== '' && !Number.isNaN(Number(after)) ? Number(after) : null,
      }
    }
  }
  return { name: 'notFound' }
}

const enc = encodeURIComponent

export const paths = {
  home: () => '#/',
  library: () => '#/library',
  stats: () => '#/stats',
  settings: () => '#/settings',
  course: (courseId: string) => `#/c/${enc(courseId)}`,
  book: (courseId: string, bookId: string) => `#/c/${enc(courseId)}/${enc(bookId)}`,
  typing: (courseId: string, bookId: string, chapter: number, after?: number) =>
    `#/c/${enc(courseId)}/${enc(bookId)}/${chapter}${after !== undefined ? `?after=${after}` : ''}`,
}

export function navigate(hash: string, options: { replace?: boolean } = {}) {
  if (options.replace) {
    const url = new URL(window.location.href)
    url.hash = hash
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

function getHash() {
  return window.location.hash
}

/** The current hash (re-renders on change). */
export function useHash(): string {
  return useSyncExternalStore(subscribe, getHash, getHash)
}
