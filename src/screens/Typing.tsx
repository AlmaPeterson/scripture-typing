import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp, useLoad } from '../app/context'
import { navigate, paths } from '../app/router'
import { formatDuration, formatPercent, formatWpm } from '../components/format'
import { DraftBadge, LoadError, Loading, NotFound, ProgressBar } from '../components/ui'
import { VerseBlock, type VerseMode } from '../components/VerseBlock'
import { nextChapter } from '../library/progress'
import {
  findBook,
  findCourse,
  loadBook,
  type BookInfo,
  type CourseInfo,
  type Verse,
} from '../library/texts'
import type { Note, ScrollStyle } from '../storage'
import { TypingEngine, type VerseResult } from '../typing'

/** Enter on the summary is ignored this long after the chapter ends, so a late Enter meant for a verse does not skip ahead. */
const NEXT_ENTER_DELAY_MS = 600

interface Props {
  courseId: string
  bookId: string
  chapter: number
  after: number | null
}

export function Typing({ courseId, bookId, chapter, after }: Props) {
  const { storage, library, settings } = useApp()
  const course = library ? findCourse(library, courseId) : undefined
  const bookInfo = course ? findBook(course, bookId) : undefined
  const [restarts, setRestarts] = useState(0)

  const load = useCallback(async () => {
    if (!bookInfo) return null
    const [book, progress, notes] = await Promise.all([
      loadBook(bookInfo),
      storage.getChapterProgress(courseId, bookId, chapter),
      storage.getNotes(courseId, bookId, chapter),
    ])
    return { book, progress, notes }
  }, [storage, bookInfo, courseId, bookId, chapter])
  const { data, error } = useLoad(load)

  const chapterData = data?.book.chapters.find((c) => c.number === chapter)
  const verses = chapterData?.verses

  // Where to start: the verse after `after`, or after the last completed verse
  // of an unfinished chapter, or the beginning.
  let startIndex = 0
  if (verses && data) {
    if (after !== null) {
      startIndex = verses.findIndex((v) => v.number > after)
    } else if (data.progress && !data.progress.completed && data.progress.lastVerse !== null) {
      const last = data.progress.lastVerse
      startIndex = Math.max(
        0,
        verses.findIndex((v) => v.number > last),
      )
    }
  }
  const pastEnd = verses !== undefined && startIndex < 0
  const resumed = startIndex > 0

  // Continue pointed past the last verse: go on to the next chapter.
  useEffect(() => {
    if (!pastEnd || !course) return
    const next = nextChapter(course, bookId, chapter)
    navigate(
      next ? paths.typing(course.id, next.bookId, next.chapter, 0) : paths.course(course.id),
      {
        replace: true,
      },
    )
  }, [pastEnd, course, bookId, chapter])

  if (!library) return <Loading />
  if (!course || !bookInfo) return <NotFound what="book" />
  if (error) return <LoadError error={error} />
  if (!data) return <Loading />
  if (!verses) return <NotFound what={bookInfo.unitLabel.toLowerCase()} />
  if (pastEnd) return <Loading />

  return (
    <TypingSession
      key={`${courseId}/${bookId}/${chapter}/${startIndex}/${restarts}`}
      course={course}
      book={bookInfo}
      chapter={chapter}
      verses={verses}
      startIndex={startIndex}
      resumed={resumed}
      initialNotes={data.notes}
      scrollStyle={settings.scrollStyle}
      onRestart={() => {
        setRestarts((n) => n + 1)
        navigate(paths.typing(courseId, bookId, chapter, 0), { replace: true })
      }}
    />
  )
}

interface SessionProps {
  course: CourseInfo
  book: BookInfo
  chapter: number
  verses: Verse[]
  startIndex: number
  resumed: boolean
  initialNotes: Note[]
  scrollStyle: ScrollStyle
  onRestart: () => void
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function TypingSession({
  course,
  book,
  chapter,
  verses,
  startIndex,
  resumed,
  initialNotes,
  scrollStyle,
  onRestart,
}: SessionProps) {
  const { storage } = useApp()
  const [engine] = useState(() => new TypingEngine(verses, { startVerse: startIndex }))
  const [session] = useState(() => ({ id: newId(), startedAt: Date.now() }))
  const [tick, setTick] = useState(0)
  const [focused, setFocused] = useState(false)
  const [finished, setFinished] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notes, setNotes] = useState(() => new Map(initialNotes.map((n) => [n.verse, n])))
  const [editing, setEditing] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLAnchorElement>(null)
  const saving = useRef<Promise<void>>(Promise.resolve())
  const lastLineTop = useRef<number | null>(null)
  const finishedAt = useRef(0)

  const lastVerseNumber = verses.at(-1)?.number ?? 0
  const next = nextChapter(course, book.id, chapter)

  const save = useCallback(
    (result: VerseResult, chapterCompleted: boolean) => {
      const completion = {
        sessionId: session.id,
        sessionStartedAt: session.startedAt,
        courseId: course.id,
        bookId: book.id,
        chapter,
        // The last verse's number, so Continue knows when the chapter ends
        // even if a draft chapter skips a number.
        verseCount: lastVerseNumber,
        result,
        keyStats: engine.takeKeyStats(),
        chapterCompleted,
        at: Date.now(),
      }
      saving.current = saving.current
        .then(() => storage.recordVerse(completion))
        .catch((err: unknown) => setSaveError(String(err)))
    },
    [session, course.id, book.id, chapter, lastVerseNumber, engine, storage],
  )

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || finished) return
    const time = performance.now()
    if (e.key === 'Escape') {
      e.currentTarget.blur()
      return
    }
    if (e.altKey || e.metaKey || (e.ctrlKey && e.key !== 'Backspace')) return
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (e.ctrlKey) engine.backspaceWord(time)
      else engine.backspace(time)
    } else if (e.key === 'Enter' || e.key.length === 1) {
      e.preventDefault()
      const r = engine.input(e.key, time)
      if (r.completedVerse) save(r.completedVerse, r.finished)
      if (r.finished) {
        finishedAt.current = time
        setFinished(true)
      }
    } else {
      return
    }
    setTick((n) => n + 1)
  }

  // Keep the current line near the top as lines are finished.
  useLayoutEffect(() => {
    if (finished) return
    const caret = textRef.current?.querySelector<HTMLElement>('[data-caret]')
    if (!caret) return
    const top = caret.offsetTop
    if (top === lastLineTop.current) return
    const first = lastLineTop.current === null
    lastLineTop.current = top
    const rect = caret.getBoundingClientRect()
    const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0
    const lineHeight =
      parseFloat(getComputedStyle(textRef.current!).lineHeight) || rect.height || 30
    // The current line sits one line below the stats bar, so the line just
    // finished stays visible above it.
    const anchor = barBottom + lineHeight + 16
    let delta = rect.top - anchor
    if (scrollStyle === 'block' && !first) {
      const below = rect.bottom > window.innerHeight * 0.8
      const above = rect.top < barBottom
      if (!below && !above) return
    }
    if (Math.abs(delta) < 2) return
    if (first && delta < 0 && window.scrollY === 0) delta = 0
    window.scrollBy({
      top: delta,
      behavior: scrollStyle === 'smooth' && !first ? 'smooth' : 'auto',
    })
  }, [tick, finished, scrollStyle])

  // Re-anchor after the window is resized (lines re-wrap).
  useEffect(() => {
    const onResize = () => {
      lastLineTop.current = null
      setTick((n) => n + 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Start typing straight away; Enter brings focus back after a pause. On the
  // summary, Enter goes to the next chapter (unless another button has focus).
  useEffect(() => {
    focusInput()
    const onDocKey = (e: KeyboardEvent) => {
      const active = document.activeElement
      const idle = !active || active === document.body || active === textRef.current
      if (e.key !== 'Enter') return
      if (!finished) {
        if (idle) {
          e.preventDefault()
          focusInput()
        }
        return
      }
      const link = nextRef.current
      if (!link || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (!idle && active !== link && active !== inputRef.current) return
      e.preventDefault()
      if (e.repeat || performance.now() - finishedAt.current < NEXT_ENTER_DELAY_MS) return
      navigate(link.getAttribute('href') ?? paths.home())
    }
    document.addEventListener('keydown', onDocKey)
    return () => document.removeEventListener('keydown', onDocKey)
  }, [focusInput, finished])

  useEffect(() => {
    if (finished) {
      window.scrollTo({ top: 0 })
      nextRef.current?.focus()
    }
  }, [finished])

  const onEditNote = useCallback((verse: number) => setEditing(verse), [])
  const onCancelNote = useCallback(() => {
    setEditing(null)
    focusInput()
  }, [focusInput])
  const onSaveNote = useCallback(
    (verse: number, text: string) => {
      storage.saveNote(course.id, book.id, chapter, verse, text).then(
        (note) => {
          setNotes((m) => {
            const copy = new Map(m)
            if (note) copy.set(verse, note)
            else copy.delete(verse)
            return copy
          })
          setEditing(null)
          focusInput()
        },
        (err: unknown) => setSaveError(String(err)),
      )
    },
    [storage, course.id, book.id, chapter, focusInput],
  )

  const current = engine.currentVerse
  const typedVerses = verses.length - startIndex
  const doneVerses = engine.verses.filter((v, i) => !v.skipped && engine.verseDone(i)).length
  const chapterLabel = `${book.title} ${course.books.length === 1 ? `${book.unitLabel} ` : ''}${chapter}`
  const single = course.books.length === 1
  const unitWord = book.unitLabel === 'Lecture' ? 'Paragraph' : 'Verse'

  return (
    <div className="typing-page">
      <div className="typing-bar" ref={barRef}>
        <div className="typing-bar-inner">
          <div className="typing-title">
            <a href={paths.book(course.id, book.id)} className="back-link">
              ← {single ? `${book.unitLabel}s` : book.title}
            </a>
            <h1>
              {chapterLabel} {book.draft && <DraftBadge />}
            </h1>
          </div>
          <dl className="live-stats" aria-label="Live stats">
            <div>
              <dt>{unitWord} WPM</dt>
              <dd data-testid="live-wpm">
                {engine.verseActiveMs > 0 ? formatWpm(engine.verseWpm) : '–'}
              </dd>
              <dd className="live-sub" data-testid="chapter-wpm">
                {book.unitLabel.toLowerCase()} {formatWpm(engine.wpm)}
              </dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd data-testid="live-accuracy">{formatPercent(engine.accuracy, 1)}</dd>
            </div>
            <div>
              <dt>{unitWord}</dt>
              <dd>
                {engine.verses[current]?.number ?? '–'}/{lastVerseNumber}
              </dd>
            </div>
          </dl>
        </div>
        <ProgressBar
          value={typedVerses ? doneVerses / typedVerses : 1}
          label="Progress through this chapter"
        />
        {/* An overlay below the bar, so it never moves the text under the pointer. */}
        {!focused && !finished && editing === null && (
          <button type="button" className="paused" onClick={focusInput}>
            Paused – click here or press Enter to keep typing
          </button>
        )}
      </div>

      {saveError && (
        <p className="message error" role="alert">
          Could not save your progress: {saveError}
        </p>
      )}

      {finished && (
        <section className="summary" aria-labelledby="summary-title">
          <h2 id="summary-title">{chapterLabel} complete</h2>
          <dl className="summary-stats">
            <div>
              <dt>WPM</dt>
              <dd>{formatWpm(engine.wpm)}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{formatPercent(engine.accuracy, 1)}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{formatDuration(engine.activeMs)}</dd>
            </div>
            <div>
              <dt>Mistakes</dt>
              <dd>{engine.errors}</dd>
            </div>
          </dl>
          <div className="summary-actions">
            {next ? (
              <a
                ref={nextRef}
                className="button button-primary"
                href={paths.typing(course.id, next.bookId, next.chapter)}
              >
                Next:{' '}
                {next.bookId === book.id
                  ? `${book.unitLabel} ${next.chapter}`
                  : `${course.books.find((b) => b.id === next.bookId)?.title} 1`}{' '}
                →
              </a>
            ) : (
              <a ref={nextRef} className="button button-primary" href={paths.home()}>
                Course finished – back to Home
              </a>
            )}
            <button type="button" className="button" onClick={onRestart}>
              Type it again
            </button>
            <a className="button button-quiet" href={paths.book(course.id, book.id)}>
              All {book.unitLabel.toLowerCase()}s
            </a>
          </div>
          <p className="muted summary-hint">
            Press Enter to {next ? 'continue' : 'go back to Home'}.
          </p>
        </section>
      )}

      {!finished && resumed && (
        <p className="resume-note muted">
          Resuming after {book.unitLabel === 'Lecture' ? 'paragraph' : 'verse'}{' '}
          {verses[startIndex - 1]?.number}.{' '}
          <button type="button" className="link-button" onClick={onRestart}>
            Start from the beginning
          </button>
        </p>
      )}

      <textarea
        ref={inputRef}
        className="typing-input"
        aria-label={`Type ${chapterLabel}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value=""
        onChange={() => {}}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        readOnly={finished}
      />

      <div
        ref={textRef}
        className={`scripture ${focused || finished ? 'is-focused' : 'is-paused'}`}
        onMouseUp={(e) => {
          const target = e.target as HTMLElement
          if (finished || target.closest('button, textarea, a, form')) return
          if (window.getSelection()?.toString()) return
          focusInput()
        }}
      >
        {engine.verses.map((layout, i) => {
          let mode: VerseMode
          if (layout.skipped) mode = 'skipped'
          else if (i === current && !engine.finished) mode = 'current'
          else if (engine.verseDone(i)) mode = 'done'
          else mode = 'pending'
          return (
            <VerseBlock
              key={layout.index}
              layout={layout}
              engine={engine}
              mode={mode}
              tick={mode === 'current' ? tick : 0}
              unitLabel={book.unitLabel}
              note={notes.get(layout.number)}
              editing={editing === layout.number}
              onEditNote={onEditNote}
              onSaveNote={onSaveNote}
              onCancelNote={onCancelNote}
            />
          )
        })}
      </div>
    </div>
  )
}
