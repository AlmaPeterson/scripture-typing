import { useCallback, useEffect } from 'react'
import { useApp, useLoad } from '../app/context'
import { navigate, paths } from '../app/router'
import { formatPercent } from '../components/format'
import { Breadcrumbs, DraftBadge, Loading, NotFound, ProgressBar } from '../components/ui'
import { bookProgress, continueTarget } from '../library/progress'
import { findCourse } from '../library/texts'

export function Course({ courseId }: { courseId: string }) {
  const { storage, library } = useApp()
  const course = library ? findCourse(library, courseId) : undefined
  const single = course?.books.length === 1 ? course.books[0] : undefined

  // A one-book course goes straight to the book's chapter grid.
  useEffect(() => {
    if (single) navigate(paths.book(courseId, single.id), { replace: true })
  }, [single, courseId])

  const load = useCallback(() => storage.getProgress(courseId), [storage, courseId])
  const { data: progress } = useLoad(load)

  if (!library) return <Loading />
  if (!course) return <NotFound what="course" />
  if (single || !progress) return <Loading />

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'Home', href: paths.home() }, { label: course.title }]} />
      <h1>{course.title}</h1>
      <ul className="book-list">
        {course.books.map((book) => {
          const summary = bookProgress(book, progress)
          const target = continueTarget(course, progress, book.id)
          const started = progress.some((p) => p.bookId === book.id)
          return (
            <li key={book.id} className="book-row">
              <div className="book-main">
                <a className="book-title" href={paths.book(course.id, book.id)}>
                  {book.title}
                </a>
                {book.draft && <DraftBadge />}
                <ProgressBar value={summary.fraction} label={`${book.title} progress`} />
                <span className="card-meta">
                  {summary.completedChapters}/{book.chapters}
                  {summary.fraction > 0 && ` · ${formatPercent(summary.fraction)}`}
                </span>
              </div>
              {target && (
                <a
                  className={`button ${started ? 'button-primary' : ''}`}
                  href={paths.typing(course.id, target.bookId, target.chapter, target.after)}
                  aria-label={`${started ? 'Continue' : 'Start'} ${book.title}`}
                >
                  {started ? 'Continue' : 'Start'}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
