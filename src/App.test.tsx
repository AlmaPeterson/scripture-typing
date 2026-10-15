import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { resetTextCache, type Book, type LibraryIndex } from './library/texts'
import { DexieStorage } from './storage/dexie'

const index: LibraryIndex = {
  courses: [
    {
      id: 'mini',
      title: 'Mini Scripture',
      books: [
        {
          id: 'alpha',
          title: 'Alpha',
          unitLabel: 'Chapter',
          chapters: 2,
          path: 'texts/mini/alpha.json',
        },
        {
          id: 'beta',
          title: 'Beta',
          unitLabel: 'Chapter',
          chapters: 1,
          path: 'texts/mini/beta.json',
          draft: true,
        },
      ],
    },
    {
      id: 'one',
      title: 'One Book',
      books: [
        {
          id: 'one',
          title: 'One Book',
          unitLabel: 'Section',
          chapters: 1,
          path: 'texts/one/one.json',
        },
      ],
    },
  ],
}

const books: Record<string, Book> = {
  'texts/mini/alpha.json': {
    id: 'alpha',
    title: 'Alpha',
    volume: 'mini',
    unitLabel: 'Chapter',
    chapters: [
      {
        number: 1,
        verses: [
          { number: 1, text: 'In the beginning.' },
          { number: 2, text: 'God said—light.' },
        ],
      },
      { number: 2, verses: [{ number: 1, text: 'And it was so.' }] },
    ],
  },
  'texts/mini/beta.json': {
    id: 'beta',
    title: 'Beta',
    volume: 'mini',
    unitLabel: 'Chapter',
    chapters: [{ number: 1, verses: [{ number: 1, text: 'Beta one.' }] }],
  },
  'texts/one/one.json': {
    id: 'one',
    title: 'One Book',
    volume: 'one',
    unitLabel: 'Section',
    chapters: [{ number: 1, verses: [{ number: 1, text: 'Hearken.' }] }],
  },
}

let n = 0
let storage: DexieStorage

beforeEach(() => {
  resetTextCache()
  storage = new DexieStorage(`app-test-${++n}`)
  window.location.hash = '#/'
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url)
      if (path.endsWith('texts/index.json')) return Response.json(index)
      const book = Object.entries(books).find(([p]) => path.endsWith(p))?.[1]
      return book ? Response.json(book) : new Response('missing', { status: 404 })
    }),
  )
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  window.scrollBy = vi.fn() as unknown as typeof window.scrollBy
})

afterEach(() => {
  storage.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('App', () => {
  it('adds a course, types a chapter with mistakes, and tracks progress, Continue and notes', async () => {
    const user = userEvent.setup()
    render(<App storage={storage} />)

    // Home is empty; go to the Library and add a course.
    await user.click(await screen.findByRole('link', { name: 'Choose a course to start' }))
    await user.click(await screen.findByRole('button', { name: 'Add Mini Scripture to Home' }))
    expect(await screen.findByLabelText('Mini Scripture is on Home')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 books are still being proofread')).toBeInTheDocument()

    // Home shows the course with progress and Start.
    await go('#/')
    const start = await screen.findByRole('link', { name: 'Continue Mini Scripture' })
    expect(start).toHaveTextContent('Start')

    // Course screen lists books with progress and a draft label.
    await go('#/c/mini')
    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByText('Draft – may contain errors')).toBeInTheDocument()

    // Chapter grid.
    await user.click(screen.getByRole('link', { name: 'Alpha' }))
    expect(await screen.findByRole('link', { name: 'Chapter 1, not started' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Chapter 1, not started' }))

    // Typing view: verse numbers shown, typing goes to the hidden input.
    const input = await screen.findByLabelText('Type Alpha 1')
    await waitFor(() => expect(input).toHaveFocus())
    // A mistake fixed with Backspace, then the rest of verse 1.
    await user.keyboard('In tje{Backspace}{Backspace}he beginning.')
    expect(screen.getByTestId('live-accuracy').textContent).not.toBe('100.0%')
    await waitFor(async () =>
      expect((await storage.getChapterProgress('mini', 'alpha', 1))?.completedVerses).toEqual([1]),
    )

    // Add a note to verse 1 while typing.
    await user.click(screen.getByRole('button', { name: 'Add note on verse 1' }))
    await user.type(screen.getByLabelText('Note on verse 1'), 'Creation')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Creation')).toBeInTheDocument()
    expect(await storage.getNotes('mini', 'alpha', 1)).toEqual([
      expect.objectContaining({ verse: 1, text: 'Creation' }),
    ])
    await waitFor(() => expect(input).toHaveFocus())

    // Verse 2: Enter between verses, the em dash typed as "-", one wrong key left unfixed.
    await user.keyboard('{Enter}God saix-light.')
    expect(await screen.findByText('Alpha 1 complete')).toBeInTheDocument()

    const progress = await storage.getChapterProgress('mini', 'alpha', 1)
    expect(progress).toMatchObject({ completed: true, completedVerses: [1, 2] })
    const [session] = await storage.getSessions()
    expect(session).toMatchObject({ verses: 2, completedChapter: true, errors: 2 })
    expect((await storage.getKeyStats('word')).map((w) => w.key)).toContain('beginning')
    expect(await storage.getDaily()).toHaveLength(1)

    // Back on Home: progress and Continue to the next chapter.
    await go('#/')
    const cont = await screen.findByRole('link', { name: 'Continue Mini Scripture' })
    expect(cont).toHaveTextContent('Continue')
    expect(cont).toHaveTextContent('Alpha 2')
    expect(screen.getByRole('progressbar', { name: 'Mini Scripture progress' })).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((1 / 3) * 1000) / 10),
    )

    // The chapter grid marks chapter 1 as completed.
    await go('#/c/mini/alpha')
    expect(await screen.findByRole('link', { name: 'Chapter 1, completed' })).toBeInTheDocument()
  })

  it('resumes an unfinished chapter after the last completed verse', async () => {
    const user = userEvent.setup()
    await storage.addCourse('mini')
    window.location.hash = '#/c/mini/alpha/1'
    render(<App storage={storage} />)
    const input = await screen.findByLabelText('Type Alpha 1')
    await waitFor(() => expect(input).toHaveFocus())
    await user.keyboard('In the beginning.')
    await waitFor(async () => expect(await storage.getProgress('mini')).toHaveLength(1))

    await go('#/')
    const cont = await screen.findByRole('link', { name: 'Continue Mini Scripture' })
    expect(cont).toHaveAttribute('href', '#/c/mini/alpha/1?after=1')
    await user.click(cont)
    const verse1 = await screen.findByText('In the beginning.')
    expect(verse1.closest('.verse')).toHaveClass('verse-skipped')
    expect(screen.getByText(/Resuming after verse/)).toBeInTheDocument()
  })

  it('skips the Course screen for one-book courses', async () => {
    render(<App storage={storage} />)
    await go('#/c/one')
    expect(await screen.findByRole('link', { name: 'Section 1, not started' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/c/one/one')
  })

  it('exports, clears and imports data from Settings', async () => {
    const user = userEvent.setup()
    await storage.addCourse('mini')
    await storage.saveNote('mini', 'alpha', 1, 1, 'Kept')
    const backup = await storage.exportAll()

    window.location.hash = '#/settings'
    render(<App storage={storage} />)
    await user.click(await screen.findByLabelText('Reset Mini Scripture every January 1'))
    await waitFor(async () => expect((await storage.getShelf())[0].yearlyReset).toBe(true))

    await user.click(screen.getByLabelText('Dark'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))

    await user.click(screen.getByRole('button', { name: 'Delete all data' }))
    expect(await screen.findByText('All data deleted.')).toBeInTheDocument()
    expect(await storage.getShelf()).toEqual([])
    expect(document.documentElement.dataset.theme).toBeUndefined()

    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Backup file to import'), file)
    expect(await screen.findByText('Backup imported.')).toBeInTheDocument()
    expect(await storage.getShelf()).toHaveLength(1)
    expect(await storage.getAllNotes()).toHaveLength(1)

    const bad = new File(['{"nope":1}'], 'bad.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Backup file to import'), bad)
    expect(
      await screen.findByText('This file is not a Scripture Typer backup.'),
    ).toBeInTheDocument()
    expect(await storage.getShelf()).toHaveLength(1)
  })

  it('runs the yearly reset when the app opens', async () => {
    await storage.addCourse('mini', new Date(2025, 5, 1).getTime())
    await storage.setYearlyReset('mini', true)
    await storage.recordVerse({
      sessionId: 's',
      sessionStartedAt: 0,
      courseId: 'mini',
      bookId: 'alpha',
      chapter: 1,
      verseCount: 2,
      result: {
        verseIndex: 0,
        verseNumber: 1,
        correctChars: 10,
        keystrokes: 10,
        correctKeystrokes: 10,
        errors: 0,
        activeMs: 1000,
        wpm: 120,
        accuracy: 1,
      },
      keyStats: [],
      chapterCompleted: false,
      at: new Date(2025, 5, 2).getTime(),
    })
    render(<App storage={storage} />)
    const card = (await screen.findByRole('link', { name: 'Continue Mini Scripture' })).closest(
      'li',
    )!
    expect(within(card).getByText('Start')).toBeInTheDocument()
    expect(await storage.getProgress('mini')).toEqual([])
    expect(await storage.getVerseStats()).toHaveLength(1)
  })
})
