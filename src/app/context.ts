import { createContext, useContext, useEffect, useState } from 'react'
import type { LibraryIndex } from '../library/texts'
import type { Settings, Storage } from '../storage'

export interface AppContextValue {
  storage: Storage
  library: LibraryIndex | null
  libraryError: string | null
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  /** Re-read settings etc. after an import or clear. */
  refresh: () => Promise<void>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

export function useStorage(): Storage {
  return useApp().storage
}

export interface Loaded<T> {
  data: T | undefined
  error: unknown
  loading: boolean
}

/**
 * Run an async loader and keep its result. Pass a stable function
 * (useCallback); it runs again whenever it changes.
 */
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ load: () => Promise<T>; data?: T; error?: unknown }>({
    load,
  })
  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setState({ load, data })
      },
      (error: unknown) => {
        if (!cancelled) setState({ load, error })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load])
  // While reloading, keep showing the previous data instead of a blank page.
  const current = state.load === load
  return {
    data: state.data,
    error: current ? state.error : undefined,
    loading: !current || (state.data === undefined && state.error === undefined),
  }
}
