import { useCallback, useEffect, useState } from 'react'
import { useApp, useLoad } from '../app/context'
import { paths } from '../app/router'
import { formatPercent } from '../components/format'
import { Loading, ProgressBar } from '../components/ui'
import { continueTarget, courseProgress } from '../library/progress'
import { findCourse, isCourseCached, prefetchCourse, type CourseInfo } from '../library/texts'
import type { ChapterProgress, ShelfEntry } from '../storage'

interface HomeCourse {
  entry: ShelfEntry
  course: CourseInfo
  progress: ChapterProgress[]
}

export function Home() {
  const { storage, library } = useApp()
  const [version, setVersion] = useState(0)
  const load = useCallback(async () => {
    void version
    if (!library) return []
    const shelf = await storage.getShelf()
    const out: HomeCourse[] = []
    for (const entry of shelf) {
      const course = findCourse(library, entry.courseId)
      if (course) out.push({ entry, course, progress: await storage.getProgress(course.id) })
    }
    return out
  }, [storage, library, version])
  const { data } = useLoad(load)

  if (!library || !data) return <Loading />

  const remove = async (course: CourseInfo) => {
    if (
      !window.confirm(
        `Remove ${course.title} from Home? Your progress, notes and stats are kept and come back if you add it again.`,
      )
    )
      return
    await storage.removeCourse(course.id)
    setVersion((v) => v + 1)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>My courses</h1>
        <a className="button button-primary" href={paths.library()} aria-label="Add a course">
          <span aria-hidden="true">+</span> Add course
        </a>
      </div>
      {data.length === 0 ? (
        <div className="empty">
          <p>Type the scriptures to learn them and improve your typing at the same time.</p>
          <p>
            <a className="button button-primary" href={paths.library()}>
              Choose a course to start
            </a>
          </p>
        </div>
      ) : (
        <ul className="card-list">
          {data.map((c) => (
            <HomeCard key={c.course.id} item={c} onRemove={() => remove(c.course)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function HomeCard({ item, onRemove }: { item: HomeCourse; onRemove: () => void }) {
  const { course, progress } = item
  const summary = courseProgress(course, progress)
  const target = continueTarget(course, progress)
  const targetBook = target && course.books.find((b) => b.id === target.bookId)
  const openHref =
    course.books.length === 1 ? paths.book(course.id, course.books[0].id) : paths.course(course.id)
  const started = progress.length > 0
  const done = summary.completedChapters === summary.totalChapters

  return (
    <li className="card">
      <div className="card-main">
        <h2 className="card-title">
          <a href={openHref}>{course.title}</a>
        </h2>
        <ProgressBar value={summary.fraction} label={`${course.title} progress`} />
        <p className="card-meta">
          {formatPercent(summary.fraction, summary.fraction > 0 && summary.fraction < 0.1 ? 1 : 0)}{' '}
          · {summary.completedChapters} of {summary.totalChapters}{' '}
          {course.books.length === 1 ? `${course.books[0].unitLabel.toLowerCase()}s` : 'chapters'}
          {done && ' · Finished'}
          <OfflineStatus course={course} />
        </p>
      </div>
      <div className="card-actions">
        {target && targetBook && (
          <a
            className="button button-primary"
            href={paths.typing(course.id, target.bookId, target.chapter, target.after)}
            aria-label={`Continue ${course.title}`}
          >
            {started ? 'Continue' : 'Start'}
            <span className="button-sub">
              {course.books.length > 1 ? `${targetBook.title} ` : `${targetBook.unitLabel} `}
              {target.chapter}
            </span>
          </a>
        )}
        <button
          type="button"
          className="button button-quiet"
          onClick={onRemove}
          aria-label={`Remove ${course.title} from Home`}
        >
          Remove
        </button>
      </div>
    </li>
  )
}

/** Shows whether a course's books are downloaded, and downloads them if not. */
function OfflineStatus({ course }: { course: CourseInfo }) {
  const [state, setState] = useState<'checking' | 'ready' | 'downloading' | 'failed'>('checking')
  const [done, setDone] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (await isCourseCached(course)) {
        if (!cancelled) setState('ready')
        return
      }
      if (typeof caches === 'undefined' || !navigator.onLine) {
        if (!cancelled) setState('failed')
        return
      }
      if (!cancelled) setState('downloading')
      try {
        await prefetchCourse(course, (n) => {
          if (!cancelled) setDone(n)
        })
        if (!cancelled) setState('ready')
      } catch {
        if (!cancelled) setState('failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [course])

  if (state === 'checking') return null
  return (
    <span className={`offline offline-${state}`}>
      {' · '}
      {state === 'ready' && 'Available offline'}
      {state === 'downloading' && `Downloading for offline use (${done}/${course.books.length})`}
      {state === 'failed' && 'Not yet downloaded for offline use'}
    </span>
  )
}
