import { useCallback, useState } from 'react'
import { useApp, useLoad } from '../app/context'
import { paths } from '../app/router'
import { Loading } from '../components/ui'
import { prefetchCourse, type CourseInfo } from '../library/texts'

export function Library() {
  const { storage, library } = useApp()
  const [version, setVersion] = useState(0)
  const [status, setStatus] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    void version
    return new Set((await storage.getShelf()).map((s) => s.courseId))
  }, [storage, version])
  const { data: onHome } = useLoad(load)

  if (!library || !onHome) return <Loading />

  const add = async (course: CourseInfo) => {
    await storage.addCourse(course.id)
    setVersion((v) => v + 1)
    // Ask the browser not to evict our data, and download the books for offline use.
    void navigator.storage?.persist?.().catch(() => false)
    setStatus((s) => ({ ...s, [course.id]: 'Downloading for offline use…' }))
    prefetchCourse(course).then(
      () => setStatus((s) => ({ ...s, [course.id]: 'Available offline' })),
      () =>
        setStatus((s) => ({
          ...s,
          [course.id]: 'Could not download yet; it will be retried from Home.',
        })),
    )
  }

  return (
    <div className="page">
      <h1>Library</h1>
      <p className="muted">Add a course to Home to start typing it.</p>
      <ul className="card-list">
        {library.courses.map((course) => {
          const drafts = course.books.filter((b) => b.draft)
          const added = onHome.has(course.id)
          const openHref =
            course.books.length === 1
              ? paths.book(course.id, course.books[0].id)
              : paths.course(course.id)
          return (
            <li className="card" key={course.id}>
              <div className="card-main">
                <h2 className="card-title">{course.title}</h2>
                <p className="card-meta">
                  {course.books.length === 1
                    ? `${course.books[0].chapters} ${course.books[0].unitLabel.toLowerCase()}s`
                    : `${course.books.length} books`}
                  {status[course.id] && <> · {status[course.id]}</>}
                </p>
                {drafts.length > 0 && (
                  <details className="drafts">
                    <summary>
                      <span className="badge badge-draft">Draft – may contain errors</span>{' '}
                      {drafts.length === course.books.length
                        ? 'All books are still being proofread'
                        : `${drafts.length} of ${course.books.length} books are still being proofread`}
                    </summary>
                    <p className="muted">{drafts.map((b) => b.title).join(', ')}</p>
                  </details>
                )}
              </div>
              <div className="card-actions">
                {added ? (
                  <>
                    <span className="added" aria-label={`${course.title} is on Home`}>
                      On Home ✓
                    </span>
                    <a className="button" href={openHref}>
                      Open
                    </a>
                  </>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => add(course)}
                    aria-label={`Add ${course.title} to Home`}
                  >
                    Add to Home
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
