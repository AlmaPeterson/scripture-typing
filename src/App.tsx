import { useEffect, useMemo } from 'react'
import { AppProvider } from './app/AppProvider'
import { parseHash, useHash, type Route } from './app/router'
import { Layout } from './components/Layout'
import { NotFound } from './components/ui'
import { ChapterGrid } from './screens/ChapterGrid'
import { Course } from './screens/Course'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { Typing } from './screens/Typing'
import { createStorage, type Storage } from './storage'

const defaultStorage = createStorage()

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />
    case 'library':
      return <Library />
    case 'stats':
      return <Stats />
    case 'settings':
      return <Settings />
    case 'course':
      return <Course courseId={route.courseId} />
    case 'book':
      return <ChapterGrid courseId={route.courseId} bookId={route.bookId} />
    case 'typing':
      return (
        <Typing
          courseId={route.courseId}
          bookId={route.bookId}
          chapter={route.chapter}
          after={route.after}
        />
      )
    default:
      return <NotFound />
  }
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Home',
  library: 'Library',
  stats: 'Stats',
  settings: 'Settings',
}

export default function App({ storage = defaultStorage }: { storage?: Storage }) {
  const hash = useHash()
  const route = useMemo(() => parseHash(hash), [hash])

  useEffect(() => {
    const title = TITLES[route.name]
    document.title = title ? `${title} · Scripture Typer` : 'Scripture Typer'
    if (route.name !== 'typing') window.scrollTo({ top: 0 })
  }, [route])

  return (
    <AppProvider storage={storage}>
      <Layout route={route}>
        <Screen key={hash} route={route} />
      </Layout>
    </AppProvider>
  )
}
