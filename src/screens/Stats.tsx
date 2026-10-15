import { useCallback, useState } from 'react'
import { useApp, useLoad } from '../app/context'
import { paths } from '../app/router'
import { BarChart, BarList, LineChart } from '../components/charts'
import { formatDate, formatDuration, formatPercent, formatWpm } from '../components/format'
import { Loading } from '../components/ui'
import {
  aggregate,
  dailyHistory,
  rankKeys,
  shortDate,
  slowestFastest,
  type Aggregate,
  type RankedKey,
} from '../library/statsView'
import { findBook, findCourse, type LibraryIndex } from '../library/texts'
import type { VerseStat } from '../storage'
import { FINGER_LABELS, FINGERS, accuracy, keyStatWpm, wpm } from '../typing'

const RANGES: { label: string; days: number | null }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'Year', days: 365 },
  { label: 'All', days: null },
]

export function Stats() {
  const { storage, library } = useApp()
  const load = useCallback(async () => {
    const [daily, sessions, verseStats, keyStats] = await Promise.all([
      storage.getDaily(),
      storage.getSessions(),
      storage.getVerseStats(),
      storage.getKeyStats(),
    ])
    return { daily, sessions, verseStats, keyStats }
  }, [storage])
  const { data } = useLoad(load)
  const [range, setRange] = useState<number | null>(30)

  if (!data || !library) return <Loading />
  const { daily, sessions, verseStats, keyStats } = data

  if (sessions.length === 0) {
    return (
      <div className="page">
        <h1>Stats</h1>
        <div className="empty">
          <p>No typing recorded yet. Stats appear here as you complete verses.</p>
          <p>
            <a className="button button-primary" href={paths.home()}>
              Start typing
            </a>
          </p>
        </div>
      </div>
    )
  }

  const total = daily.reduce(
    (t, d) => ({
      correctChars: t.correctChars + d.correctChars,
      keystrokes: t.keystrokes + d.keystrokes,
      correctKeystrokes: t.correctKeystrokes + d.correctKeystrokes,
      activeMs: t.activeMs + d.activeMs,
      verses: t.verses + d.verses,
      chapters: t.chapters + d.chaptersCompleted,
    }),
    { correctChars: 0, keystrokes: 0, correctKeystrokes: 0, activeMs: 0, verses: 0, chapters: 0 },
  )
  const history = dailyHistory(daily, range, new Date())

  return (
    <div className="page stats">
      <h1>Stats</h1>

      <dl className="tiles">
        <div className="tile">
          <dt>Average speed</dt>
          <dd>{formatWpm(wpm(total.correctChars, total.activeMs))} WPM</dd>
        </div>
        <div className="tile">
          <dt>Accuracy</dt>
          <dd>{formatPercent(accuracy(total.correctKeystrokes, total.keystrokes), 1)}</dd>
        </div>
        <div className="tile">
          <dt>Time typing</dt>
          <dd>{formatDuration(total.activeMs)}</dd>
        </div>
        <div className="tile">
          <dt>Verses typed</dt>
          <dd>{total.verses}</dd>
        </div>
        <div className="tile">
          <dt>Chapters finished</dt>
          <dd>{total.chapters}</dd>
        </div>
        <div className="tile">
          <dt>Days typed</dt>
          <dd>{daily.filter((d) => d.activeMs > 0).length}</dd>
        </div>
      </dl>

      <section className="panel" aria-labelledby="history">
        <div className="panel-head">
          <h2 id="history">History</h2>
          <div className="segmented" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                aria-pressed={range === r.days}
                onClick={() => setRange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {history.length === 0 ? (
          <p className="muted">No typing in this period.</p>
        ) : (
          <>
            <h3 className="chart-title">Speed (WPM per day)</h3>
            <LineChart
              title="Words per minute per day"
              points={history.map((d) => ({ label: shortDate(d.date), value: d.wpm }))}
              format={(v) => v.toFixed(0)}
            />
            <h3 className="chart-title">Accuracy per day</h3>
            <LineChart
              title="Accuracy per day"
              points={history.map((d) => ({ label: shortDate(d.date), value: d.accuracy * 100 }))}
              min={Math.max(
                0,
                Math.floor(Math.min(...history.map((d) => d.accuracy * 100)) / 5) * 5 - 5,
              )}
              max={100}
              format={(v) => `${v.toFixed(0)}%`}
            />
            <h3 className="chart-title">Minutes typed per day</h3>
            <BarChart
              title="Minutes typed per day"
              points={history.map((d) => ({ label: shortDate(d.date), value: d.activeMs / 60000 }))}
              format={(v) => v.toFixed(v < 10 ? 1 : 0)}
            />
            <details>
              <summary>Show as a table</summary>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      <th scope="col">WPM</th>
                      <th scope="col">Accuracy</th>
                      <th scope="col">Time</th>
                      <th scope="col">Verses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((d) => (
                      <tr key={d.date}>
                        <td>{shortDate(d.date)}</td>
                        <td>{formatWpm(d.wpm)}</td>
                        <td>{formatPercent(d.accuracy, 1)}</td>
                        <td>{formatDuration(d.activeMs)}</td>
                        <td>{d.verses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      <Breakdown library={library} verseStats={verseStats} />

      <section className="panel" aria-labelledby="sessions">
        <h2 id="sessions">Recent sessions</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Passage</th>
                <th scope="col">Date</th>
                <th scope="col">WPM</th>
                <th scope="col">Accuracy</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {[...sessions]
                .reverse()
                .slice(0, 15)
                .map((s) => {
                  const course = findCourse(library, s.courseId)
                  const book = course && findBook(course, s.bookId)
                  const verses =
                    s.firstVerse === s.lastVerse
                      ? `${s.firstVerse}`
                      : `${s.firstVerse}–${s.lastVerse}`
                  return (
                    <tr key={s.id}>
                      <td>
                        {book?.title ?? s.bookId} {s.chapter}:{verses}
                        {s.completedChapter && <span className="muted"> ✓</span>}
                      </td>
                      <td>{formatDate(s.startedAt)}</td>
                      <td>{formatWpm(s.wpm)}</td>
                      <td>{formatPercent(s.accuracy, 1)}</td>
                      <td>{formatDuration(s.activeMs)}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </section>

      <KeyPanels keyStats={keyStats} />
    </div>
  )
}

interface Level {
  courseId?: string
  bookId?: string
  chapter?: number
}

function Breakdown({ library, verseStats }: { library: LibraryIndex; verseStats: VerseStat[] }) {
  const [level, setLevel] = useState<Level>({})
  const course = level.courseId ? findCourse(library, level.courseId) : undefined
  const book = course && level.bookId ? findBook(course, level.bookId) : undefined
  const unit = book?.unitLabel ?? 'Chapter'
  const verseWord = unit === 'Lecture' ? 'Paragraph' : 'Verse'

  let rows: Aggregate[]
  let heading: string
  let label: (a: Aggregate) => string
  let next: ((a: Aggregate) => Level) | null
  if (!level.courseId) {
    rows = aggregate(verseStats, (r) => r.courseId)
    heading = 'Course'
    label = (a) => findCourse(library, a.key)?.title ?? a.key
    next = (a) => ({ courseId: a.key })
  } else if (!level.bookId) {
    rows = aggregate(
      verseStats.filter((r) => r.courseId === level.courseId),
      (r) => r.bookId,
    )
    const order = course?.books.map((b) => b.id) ?? []
    rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    heading = 'Book'
    label = (a) => (course && findBook(course, a.key)?.title) ?? a.key
    next = (a) => ({ ...level, bookId: a.key })
  } else if (level.chapter === undefined) {
    rows = aggregate(
      verseStats.filter((r) => r.courseId === level.courseId && r.bookId === level.bookId),
      (r) => String(r.chapter),
    ).sort((a, b) => Number(a.key) - Number(b.key))
    heading = unit
    label = (a) => `${unit} ${a.key}`
    next = (a) => ({ ...level, chapter: Number(a.key) })
  } else {
    rows = aggregate(
      verseStats.filter(
        (r) =>
          r.courseId === level.courseId && r.bookId === level.bookId && r.chapter === level.chapter,
      ),
      (r) => String(r.verse),
    ).sort((a, b) => Number(a.key) - Number(b.key))
    heading = verseWord
    label = (a) => `${verseWord} ${a.key}`
    next = null
  }

  const crumbs: { label: string; level: Level }[] = [{ label: 'All courses', level: {} }]
  if (course) crumbs.push({ label: course.title, level: { courseId: course.id } })
  if (book && course && course.books.length > 1)
    crumbs.push({ label: book.title, level: { courseId: course.id, bookId: book.id } })
  if (level.chapter !== undefined) crumbs.push({ label: `${unit} ${level.chapter}`, level })

  return (
    <section className="panel" aria-labelledby="breakdown">
      <h2 id="breakdown">By course, book, chapter and verse</h2>
      <p className="panel-note">Select a row to see what it is made of.</p>
      <nav className="breadcrumbs" aria-label="Stats level">
        <ol>
          {crumbs.map((c, i) => (
            <li key={i}>
              {i < crumbs.length - 1 ? (
                <button type="button" className="link-button" onClick={() => setLevel(c.level)}>
                  {c.label}
                </button>
              ) : (
                <span aria-current="true">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{heading}</th>
              <th scope="col">WPM</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Time</th>
              <th scope="col">Verses typed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              // One-book courses skip the book level.
              const go = next && next(a)
              const target =
                go &&
                go.courseId &&
                !go.bookId &&
                findCourse(library, go.courseId)?.books.length === 1
                  ? { courseId: go.courseId, bookId: findCourse(library, go.courseId)!.books[0].id }
                  : go
              return (
                <tr key={a.key}>
                  <td>
                    {target ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setLevel(target)}
                      >
                        {label(a)}
                      </button>
                    ) : (
                      label(a)
                    )}
                  </td>
                  <td>{formatWpm(a.wpm)}</td>
                  <td>{formatPercent(a.accuracy, 1)}</td>
                  <td>{formatDuration(a.activeMs)}</td>
                  <td>{a.verses}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function rankedItems(list: RankedKey[], showKey: (k: string) => string = (k) => k) {
  return list.map((r) => ({
    key: r.key,
    label: showKey(r.key),
    value: r.wpm,
    note: `${r.samples} samples · ${formatPercent(r.errorRate, 1)} mistakes`,
  }))
}

function KeyPanels({ keyStats }: { keyStats: Parameters<typeof rankKeys>[0] }) {
  const words = slowestFastest(rankKeys(keyStats, 'word', 1), 10)
  const letters = slowestFastest(rankKeys(keyStats, 'letter', 5), 8)
  const bigrams = slowestFastest(rankKeys(keyStats, 'bigram', 5), 10)
  const fmt = (v: number) => `${v.toFixed(0)} WPM`
  const all = [...words.slowest, ...words.fastest, ...letters.fastest, ...bigrams.fastest]
  const max = Math.max(1, ...all.map((r) => r.wpm))

  const fingerItems = FINGERS.map((f) => {
    const s = keyStats.find((k) => k.kind === 'finger' && k.key === f)
    return s && s.timedCount > 0
      ? {
          key: f,
          label: FINGER_LABELS[f],
          value: keyStatWpm('finger', f, s),
          note: `${s.timedCount} keys · ${formatPercent(s.errors / Math.max(1, s.count + s.errors), 1)} mistakes`,
        }
      : null
  }).filter((x) => x !== null)

  return (
    <>
      <section className="panel" aria-labelledby="words">
        <h2 id="words">Words</h2>
        <p className="panel-note">
          Speed on words of 5 or more letters, typed without a long pause.
        </p>
        <div className="two-col">
          <div>
            <h3>Slowest</h3>
            <BarList items={rankedItems(words.slowest)} format={fmt} max={max} />
          </div>
          <div>
            <h3>Fastest</h3>
            <BarList items={rankedItems(words.fastest)} format={fmt} max={max} />
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="letters">
        <h2 id="letters">Letters and letter pairs</h2>
        <p className="panel-note">
          Time from the previous key to each correct letter. Pairs are two letters in a row inside a
          word.
        </p>
        <div className="two-col">
          <div>
            <h3>Slowest letters</h3>
            <BarList items={rankedItems(letters.slowest)} format={fmt} max={max} />
          </div>
          <div>
            <h3>Fastest letters</h3>
            <BarList items={rankedItems(letters.fastest)} format={fmt} max={max} />
          </div>
          <div>
            <h3>Slowest pairs</h3>
            <BarList items={rankedItems(bigrams.slowest)} format={fmt} max={max} />
          </div>
          <div>
            <h3>Fastest pairs</h3>
            <BarList items={rankedItems(bigrams.fastest)} format={fmt} max={max} />
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="fingers">
        <h2 id="fingers">Fingers (estimate)</h2>
        <p className="panel-note">
          This is an estimate: the app cannot see which finger pressed a key, so it assumes standard
          touch-typing positions on a QWERTY keyboard.
        </p>
        <BarList items={fingerItems} format={fmt} />
      </section>
    </>
  )
}
