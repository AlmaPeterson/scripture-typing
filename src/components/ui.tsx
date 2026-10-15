import type { ReactNode } from 'react'
import { paths } from '../app/router'

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 1000) / 10
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function DraftBadge() {
  return (
    <span className="badge badge-draft" title="This book is still being proofread">
      Draft – may contain errors
    </span>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {item.href ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Message({ children }: { children: ReactNode }) {
  return <p className="message">{children}</p>
}

export function Loading() {
  return <p className="message muted">Loading…</p>
}

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <div className="page">
      <h1>Not found</h1>
      <p>
        That {what} does not exist. <a href={paths.home()}>Go to Home</a>.
      </p>
    </div>
  )
}

export function LoadError({ error }: { error: unknown }) {
  return (
    <div className="page">
      <h1>Could not load</h1>
      <p className="muted">
        This text could not be loaded. If you are offline, add its course to Home while online so it
        is downloaded for offline use.
      </p>
      <pre className="error-detail">{String(error)}</pre>
    </div>
  )
}
