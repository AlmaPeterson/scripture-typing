import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadIndex, type LibraryIndex } from '../library/texts'
import { DEFAULT_SETTINGS, type Settings, type Storage } from '../storage'
import { AppContext, type AppContextValue } from './context'

interface Props {
  storage: Storage
  children: ReactNode
  /** Clock for the yearly reset (tests). */
  now?: () => Date
}

/** Loads settings and the library index, runs the yearly reset, then renders the app. */
export function AppProvider({ storage, children, now }: Props) {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [library, setLibrary] = useState<LibraryIndex | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setSettings(await storage.getSettings())
  }, [storage])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await storage.applyYearlyResets(now ? now() : new Date())
        const s = await storage.getSettings()
        if (!cancelled) setSettings(s)
      } catch (err) {
        console.error('Could not open storage', err)
      }
      if (!cancelled) setReady(true)
    })()
    loadIndex().then(
      (index) => {
        if (!cancelled) setLibrary(index)
      },
      (err: unknown) => {
        if (!cancelled) setLibraryError(String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [storage, now])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.dataset.textSize = settings.textSize
  }, [settings.theme, settings.textSize])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...patch }))
      setSettings(await storage.updateSettings(patch))
    },
    [storage],
  )

  const value = useMemo<AppContextValue>(
    () => ({ storage, library, libraryError, settings, updateSettings, refresh }),
    [storage, library, libraryError, settings, updateSettings, refresh],
  )

  if (!ready) return null
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
