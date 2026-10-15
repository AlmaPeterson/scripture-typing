import { useCallback } from 'react'
import { useApp, useLoad } from '../app/context'
import { paths } from '../app/router'
import { formatPercent } from '../components/format'
import { Breadcrumbs, DraftBadge, Loading, NotFound, ProgressBar } from '../components/ui'
import {
  bookProgress,
  chapterFraction,
  continueTarget,
  indexProgress,
  progressKey,
} from '../library/progress'
import { findBook, findCourse } from '../library/texts'

export function ChapterGrid({ courseId, bookId }: { courseId: string; bookId: string }) {
  const { storage, library } = useApp()
  const load = useCallback(() => storage.getProgress(courseId, bookId), [storage, courseId, bookId])
  const { data: progress } = useLoad(load)

  if (!library) return <Loading />
  const course = findCourse(library, courseId)
  const book = course && findBook(course, bookId)
  if (!course || !book) return <NotFound what="book" />
  if (!progress) return <Loading />

  const byKey = indexProgress(progress)
  const summary = bookProgress(book, progress)
  const target = continueTarget(course, progress, book.id)
  const single = course.books.length === 1
  const crumbs: { label: string; href?: string }[] = [{ label: 'Home', href: paths.home() }]
  if (!single) crumbs.push({ label: course.title, href: paths.course(course.id) })
  crumbs.push({ label: book.title })

  return (
    <div className="page">
      <Breadcrumbs items={crumbs} />
      <div className="page-head">
        <div>
          <h1>
            {book.title} {book.draft && <DraftBadge />}
          </h1>
          <p className="card-meta">
            {summary.completedChapters} of {book.chapters} {book.unitLabel.toLowerCase()}s completed
            {summary.fraction > 0 && ` · ${formatPercent(summary.fraction)}`}
          </p>
        </div>
        {target && (
          <a
            className="button button-primary"
            href={paths.typing(course.id, target.bookId, target.chapter, target.after)}
          >
            {progress.length > 0 ? 'Continue' : 'Start'}
          </a>
        )}
      </div>
      <ProgressBar value={summary.fraction} label={`${book.title} progress`} />
      <ol className="chapter-grid" aria-label={`${book.unitLabel}s`}>
        {Array.from({ length: book.chapters }, (_, i) => {
          const n = i + 1
          const p = byKey.get(progressKey(book.id, n))
          const fraction = chapterFraction(p)
          const state = p?.completed ? 'done' : fraction > 0 ? 'partial' : 'new'
          const status =
            state === 'done'
              ? 'completed'
              : state === 'partial'
                ? `${formatPercent(fraction)} typed`
                : 'not started'
          return (
            <li key={n}>
              <a
                className={`chapter chapter-${state}`}
                href={paths.typing(course.id, book.id, n)}
                aria-label={`${book.unitLabel} ${n}, ${status}`}
                style={
                  state === 'partial'
                    ? ({ '--fill': `${Math.round(fraction * 100)}%` } as React.CSSProperties)
                    : undefined
                }
              >
                {n}
              </a>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
