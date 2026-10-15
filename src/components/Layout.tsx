import type { ReactNode } from 'react'
import { paths, type Route } from '../app/router'

const LINKS: { name: Route['name']; href: string; label: string }[] = [
  { name: 'home', href: paths.home(), label: 'Home' },
  { name: 'library', href: paths.library(), label: 'Library' },
  { name: 'stats', href: paths.stats(), label: 'Stats' },
  { name: 'settings', href: paths.settings(), label: 'Settings' },
]

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href={paths.home()}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="22" height="22" />
          Scripture Typer
        </a>
        <nav aria-label="Main">
          <ul>
            {LINKS.map((l) => (
              <li key={l.name}>
                <a href={l.href} aria-current={route.name === l.name ? 'page' : undefined}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}

function skipToMain(e: React.MouseEvent) {
  // A plain "#main" link would change the hash route.
  e.preventDefault()
  document.getElementById('main')?.focus()
}
