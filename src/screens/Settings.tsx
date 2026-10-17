import { useCallback, useRef, useState } from 'react'
import { useApp, useLoad } from '../app/context'
import { Loading } from '../components/ui'
import { findCourse } from '../library/texts'
import { BackupError, localDate, type ScrollStyle, type TextSize, type Theme } from '../storage'

const SCROLL_STYLES: { value: ScrollStyle; label: string; help: string }[] = [
  {
    value: 'smooth',
    label: 'Smooth',
    help: 'The line you are typing stays in the middle; the text glides up a line at a time.',
  },
  {
    value: 'instant',
    label: 'Line by line',
    help: 'The line you are typing stays in the middle; the text jumps up a line at a time.',
  },
  {
    value: 'block',
    label: 'Block',
    help: 'The line you are typing moves down a few lines, then the text jumps up a block to bring it back above the middle.',
  },
]

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Same as system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

export function Settings() {
  const { storage, library, settings, updateSettings, refresh } = useApp()
  const [version, setVersion] = useState(0)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    void version
    return storage.getShelf()
  }, [storage, version])
  const { data: shelf } = useLoad(load)

  if (!shelf) return <Loading />

  const toggleReset = async (courseId: string, enabled: boolean) => {
    await storage.setYearlyReset(courseId, enabled)
    setVersion((v) => v + 1)
  }

  const exportData = async () => {
    const backup = await storage.exportAll()
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scripture-typer-backup-${localDate(Date.now())}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage({ text: 'Backup downloaded.' })
  }

  const importFile = async (file: File) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setMessage({ text: 'That file is not valid JSON.', error: true })
      return
    }
    if (
      !window.confirm(
        'Importing replaces ALL your current progress, notes, stats and settings with the backup. Continue?',
      )
    )
      return
    try {
      await storage.importAll(parsed)
      await refresh()
      setVersion((v) => v + 1)
      setMessage({ text: 'Backup imported.' })
    } catch (err) {
      setMessage({
        text: err instanceof BackupError ? err.message : `Import failed: ${String(err)}`,
        error: true,
      })
    }
  }

  const clearData = async () => {
    if (
      !window.confirm(
        'Delete ALL your courses, progress, notes, stats and settings on this device? Export a backup first if you want to keep them.',
      )
    )
      return
    await storage.clearAll()
    await refresh()
    setVersion((v) => v + 1)
    setMessage({ text: 'All data deleted.' })
  }

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <section aria-labelledby="appearance">
        <h2 id="appearance">Appearance</h2>
        <fieldset>
          <legend>Theme</legend>
          {THEMES.map((t) => (
            <label key={t.value} className="choice">
              <input
                type="radio"
                name="theme"
                value={t.value}
                checked={settings.theme === t.value}
                onChange={() => updateSettings({ theme: t.value })}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Text size</legend>
          {TEXT_SIZES.map((t) => (
            <label key={t.value} className="choice">
              <input
                type="radio"
                name="textSize"
                value={t.value}
                checked={settings.textSize === t.value}
                onChange={() => updateSettings({ textSize: t.value })}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Scrolling while typing</legend>
          {SCROLL_STYLES.map((s) => (
            <label key={s.value} className="choice">
              <input
                type="radio"
                name="scrollStyle"
                value={s.value}
                checked={settings.scrollStyle === s.value}
                onChange={() => updateSettings({ scrollStyle: s.value })}
              />
              {s.label} <span className="muted">– {s.help}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="yearly">
        <h2 id="yearly">Yearly reset</h2>
        <p className="muted">
          Start a course over every year: its progress is cleared the first time you open the app on
          or after January 1. Notes and stats history are kept.
        </p>
        {shelf.length === 0 ? (
          <p className="muted">Add a course to Home first.</p>
        ) : (
          <ul className="plain-list">
            {shelf.map((entry) => {
              const title =
                (library && findCourse(library, entry.courseId)?.title) ?? entry.courseId
              return (
                <li key={entry.courseId}>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={entry.yearlyReset}
                      onChange={(e) => toggleReset(entry.courseId, e.target.checked)}
                    />
                    Reset {title} every January 1
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="backup">
        <h2 id="backup">Backup</h2>
        <p className="muted">
          Your data is stored only in this browser. Export a backup to keep it safe or move it to
          another device.
        </p>
        <div className="button-row">
          <button type="button" className="button button-primary" onClick={exportData}>
            Export backup
          </button>
          <button type="button" className="button" onClick={() => fileRef.current?.click()}>
            Import backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Backup file to import"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importFile(file)
            }}
          />
          <button type="button" className="button button-danger" onClick={clearData}>
            Delete all data
          </button>
        </div>
        {message && (
          <p className={`message ${message.error ? 'error' : ''}`} role="status">
            {message.text}
          </p>
        )}
      </section>
    </div>
  )
}
