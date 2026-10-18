import { useState } from 'react'
import { useApp } from '../app/context'
import { formatPercent, formatWpm } from '../components/format'
import {
  LETTERS,
  addText,
  bestLayout,
  emptyCounts,
  isReady,
  keyTimes,
  keyboardRows,
  type KeyTimes,
  type LayoutResult,
  type TextCounts,
} from '../library/bestLayout'
import { findCourse, loadBook, type LibraryIndex } from '../library/texts'
import type { KeyStat } from '../storage'
import { KEYBOARD_LAYOUTS, msPerCharToWpm, wpm, type KeyboardLayout } from '../typing'

interface Found {
  result: LayoutResult
  counts: TextCounts
  times: KeyTimes
  courses: string[]
  /** The layout the result was worked out for. */
  layout: KeyboardLayout
}

type State =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'error'; message: string }
  | ({ status: 'done' } & Found)

/** Read every book of the courses on Home and count their letters. */
async function countCourses(library: LibraryIndex, courseIds: string[]): Promise<TextCounts> {
  const counts = emptyCounts()
  const books = courseIds.flatMap((id) => findCourse(library, id)?.books ?? [])
  for (const book of await Promise.all(books.map(loadBook))) {
    for (const chapter of book.chapters) {
      for (const verse of chapter.verses) addText(counts, verse.text)
    }
  }
  return counts
}

export function BestLayout({
  keyStats,
  layout,
  library,
}: {
  keyStats: KeyStat[]
  layout: KeyboardLayout
  library: LibraryIndex
}) {
  const { storage } = useApp()
  const [state, setState] = useState<State>({ status: 'idle' })
  const [show, setShow] = useState<'best' | 'current'>('best')
  const times = keyTimes(keyStats)
  const layoutLabel = KEYBOARD_LAYOUTS.find((l) => l.value === layout)?.label ?? layout

  const run = async () => {
    setState({ status: 'working' })
    try {
      const shelf = await storage.getShelf()
      const ids = shelf.map((e) => e.courseId).filter((id) => findCourse(library, id))
      if (ids.length === 0) {
        setState({ status: 'error', message: 'Add a course to Home first.' })
        return
      }
      const counts = await countCourses(library, ids)
      // Let "Working…" paint before the search, which takes a moment.
      await new Promise((r) => setTimeout(r, 30))
      setState({
        status: 'done',
        result: bestLayout(counts, times),
        counts,
        times,
        courses: ids.map((id) => findCourse(library, id)!.title),
        layout,
      })
      setShow('best')
    } catch (err) {
      setState({ status: 'error', message: `Could not work it out: ${String(err)}` })
    }
  }

  const found = state.status === 'done' && state.layout === layout ? state : null

  return (
    <section className="panel" aria-labelledby="best-layout">
      <h2 id="best-layout">Your best layout</h2>
      <p className="panel-note">
        Moves the letters around your {layoutLabel} keyboard so the letters and letter pairs used
        most in your courses land on the keys and key-to-key moves you are fastest at. Punctuation
        stays where it is.
      </p>
      {!isReady(times) ? (
        <p className="muted">
          Type a bit more first: {times.readyLetters} of 20 letters have been timed often enough.
        </p>
      ) : (
        <p>
          <button
            type="button"
            className="button button-primary"
            onClick={run}
            disabled={state.status === 'working'}
          >
            {state.status === 'working'
              ? 'Working…'
              : found
                ? 'Work it out again'
                : 'Find my best layout'}
          </button>
        </p>
      )}
      {state.status === 'error' && (
        <p className="message error" role="alert">
          {state.message}
        </p>
      )}
      {found && <Result found={found} show={show} setShow={setShow} layoutLabel={layoutLabel} />}
    </section>
  )
}

function Result({
  found,
  show,
  setShow,
  layoutLabel,
}: {
  found: Found
  show: 'best' | 'current'
  setShow: (s: 'best' | 'current') => void
  layoutLabel: string
}) {
  const { result, counts, times, courses, layout } = found
  const before = wpm(result.letters, result.currentMs)
  const after = wpm(result.letters, result.bestMs)
  const moved = result.letterOn.filter((l, k) => l !== LETTERS[k]).length

  // How often each letter is typed, and how fast each key is.
  const freq = LETTERS.split('').map((_, a) => {
    let n = counts.starts[a]
    for (let b = 0; b < 26; b++) n += counts.pairs[b * 26 + a]
    return n / Math.max(1, counts.letters)
  })
  const keyMs = [...times.key]
  const fastest = Math.min(...keyMs)
  const slowest = Math.max(...keyMs)
  const keyOfBest = new Map(result.letterOn.map((l, k) => [l, k]))

  // The most common pairs, and how fast they would be on each layout.
  const totalPairs = counts.pairs.reduce((s, n) => s + n, 0)
  const topPairs = [...counts.pairs.keys()]
    .sort((x, y) => counts.pairs[y] - counts.pairs[x])
    .slice(0, 10)
    .map((i) => {
      const a = Math.floor(i / 26)
      const b = i % 26
      const ka = keyOfBest.get(LETTERS[a])!
      const kb = keyOfBest.get(LETTERS[b])!
      return {
        pair: LETTERS[a] + LETTERS[b],
        share: counts.pairs[i] / Math.max(1, totalPairs),
        now: times.pair[a * 26 + b],
        best: times.pair[ka * 26 + kb],
      }
    })

  return (
    <div className="best-layout">
      <dl className="tiles tiles-small">
        <div className="tile">
          <dt>{layoutLabel} now</dt>
          <dd>{formatWpm(before)} WPM</dd>
        </div>
        <div className="tile">
          <dt>Best layout</dt>
          <dd>{formatWpm(after)} WPM</dd>
        </div>
        <div className="tile">
          <dt>Faster by</dt>
          <dd>{formatPercent(before > 0 ? after / before - 1 : 0, 1)}</dd>
        </div>
        <div className="tile">
          <dt>Letters moved</dt>
          <dd>{moved} of 26</dd>
        </div>
      </dl>
      <p className="panel-note">
        Predicted speed on the letters of {courses.join(', ')} (spaces and punctuation not counted).{' '}
        {formatPercent(result.measured.best, 0)} of the letter pairs on the best layout use your own
        timings for those two keys ({formatPercent(result.measured.current, 0)} on {layoutLabel});
        the rest are estimated from how fast you are on each key by itself.
      </p>

      <div className="panel-head">
        <h3>{show === 'best' ? 'Best layout' : layoutLabel}</h3>
        <div className="segmented" role="group" aria-label="Keyboard shown">
          <button type="button" aria-pressed={show === 'best'} onClick={() => setShow('best')}>
            Best
          </button>
          <button
            type="button"
            aria-pressed={show === 'current'}
            onClick={() => setShow('current')}
          >
            {layoutLabel}
          </button>
        </div>
      </div>
      <div
        className="keyboard"
        role="img"
        aria-label={`${show === 'best' ? 'Best layout' : layoutLabel} keyboard`}
      >
        {keyboardRows(layout).map((row, r) => (
          <div key={r} className={`keyboard-row keyboard-row-${r}`}>
            {row.map((cap, i) => {
              if (cap.letterKey < 0) {
                return (
                  <span key={i} className="keycap keycap-fixed">
                    {cap.current}
                  </span>
                )
              }
              const k = cap.letterKey
              const letter = show === 'best' ? result.letterOn[k] : LETTERS[k]
              const changed = result.letterOn[k] !== LETTERS[k]
              const heat = slowest > fastest ? (slowest - keyMs[k]) / (slowest - fastest) : 0.5
              return (
                <span
                  key={i}
                  tabIndex={0}
                  className={`keycap ${changed && show === 'best' ? 'keycap-moved' : ''} ${heat > 0.55 ? 'keycap-dark' : ''}`}
                  style={{ '--heat': `${Math.round(15 + heat * 70)}%` } as React.CSSProperties}
                >
                  <span className="keycap-letter">{letter.toUpperCase()}</span>
                  {show === 'best' && changed && (
                    <span className="keycap-was">{LETTERS[k].toUpperCase()}</span>
                  )}
                  <span className="bar-tip" role="tooltip">
                    <span className="chart-tip-title">
                      The {LETTERS[k].toUpperCase()} key on {layoutLabel}
                    </span>
                    <span className="chart-tip-value">
                      {formatWpm(msPerCharToWpm(keyMs[k]))} WPM
                    </span>
                    <dl className="tip-details">
                      <div>
                        <dt>Your time on it</dt>
                        <dd>{Math.round(keyMs[k])} ms</dd>
                      </div>
                      <div>
                        <dt>Best layout puts</dt>
                        <dd>{result.letterOn[k].toUpperCase()}</dd>
                      </div>
                      <div>
                        <dt>{result.letterOn[k].toUpperCase()} is typed</dt>
                        <dd>
                          {formatPercent(freq[LETTERS.indexOf(result.letterOn[k])], 1)} of letters
                        </dd>
                      </div>
                    </dl>
                  </span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <p className="panel-note">
        Darker keys are the ones you are fastest at. On the best layout, a small letter in the
        corner shows what is on that key now.
      </p>

      <h3>Most common letter pairs</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Pair</th>
              <th scope="col">Share</th>
              <th scope="col">{layoutLabel}</th>
              <th scope="col">Best layout</th>
            </tr>
          </thead>
          <tbody>
            {topPairs.map((p) => (
              <tr key={p.pair}>
                <td className="key-label">{p.pair}</td>
                <td>{formatPercent(p.share, 1)}</td>
                <td>{Math.round(p.now)} ms</td>
                <td>{Math.round(p.best)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
