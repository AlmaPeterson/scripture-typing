# Scripture Typer: plan

_Working name. Repo: `scripture-typing`._

A typing game where you type the scriptures instead of just reading them, so
your typing improves and you learn the scriptures at the same time. It is a
**progress tracker, not a race**.

## Scope of v1

- No accounts, no backend, no leaderboards.
- Works fully offline once installed or visited (PWA).
- All user data stays in the browser (IndexedDB via Dexie).
- Installable on Windows and Linux from Chrome / Edge.

## Tech

| Concern     | Choice                                                             |
| ----------- | ------------------------------------------------------------------ |
| UI          | React + TypeScript, built with Vite                                |
| Offline     | `vite-plugin-pwa` (Workbox service worker + web manifest)          |
| Storage     | IndexedDB through Dexie, behind the interface in `src/storage/`    |
| Hosting     | GitHub Pages, deployed by GitHub Actions on push to `main`         |
| Lint/format | ESLint (flat config, typescript-eslint, react-hooks) and Prettier  |
| Texts       | Static JSON in `public/texts/`, built by `scripts/` (see TEXTS.md) |

### Storage boundary

All persistence goes through one small interface in `src/storage/`. Screens
and the typing engine never import Dexie directly. The first implementation
is `DexieStorage`; a server-backed or syncing implementation can be added
later without touching the UI.

### Offline behaviour

- The app shell and `texts/index.json` are precached by the service worker.
- Book files are cached the first time they are opened (stale-while-revalidate),
  and also fetched once when a book is added to Home, so every book on Home
  works offline.

## Screens

### Home

- My added books, each with a progress bar and a **Continue** button.
- A **+** button opens the Library to add more books.
- Completed books stay on Home until I delete them.

### Library

- All available books, grouped by volume in canonical order (from
  `texts/index.json`).
- Tap a book to add it to Home.

### Chapter grid

- All chapters / sections / lectures of a book (label from the book's
  `unitLabel`), with completed ones marked.
- Tap one to type it.

### Typing view

- Shows the full chapter.
- The current line stays near the top; the text scrolls up as each line is
  finished. Scroll style is a setting (e.g. smooth line-by-line, or jump a
  block at a time).
- Live WPM and accuracy.
- Verse numbers are displayed but not typed.
- I can add a note to any verse / paragraph.

### Stats

History over time and detailed breakdowns (see [Stats](#stats-to-record)).

### Settings

- Per book: **reset progress every January 1** (notes are kept).
- Scroll style.
- **Export / Import** a backup of all data as one JSON file.

## Behaviour

- **Continue** goes to the last completed verse / paragraph of the book.
- **Mistakes:** a wrong letter shows red. I can keep typing or use Backspace
  to fix it. Every mistake counts against accuracy, even if fixed.
- **Completion:** a chapter counts as completed when it is finished. There is
  no accuracy minimum.
- **Verse numbers** are shown but skipped by the cursor.
- **Plain keyboard characters:** at typing time, special characters are
  converted so everything can be typed on a normal keyboard. The stored text
  keeps the original.

  | In the text              | Typed as     |
  | ------------------------ | ------------ |
  | Curly quotes `‘ ’ “ ”`   | `' "`        |
  | Em dash `—`, en dash `–` | `-`          |
  | Ellipsis `…`             | `...`        |
  | Non-breaking space       | normal space |

- **Notes** are private and attached to a specific verse / paragraph
  (volume, book, chapter, verse). They survive yearly resets.
- **Yearly reset:** if enabled for a book, on the first open on or after
  January 1, that book's completion progress is cleared. Stats history and
  notes are kept.

## Stats to record

- **WPM and accuracy** per verse / paragraph, per chapter, and per book.
- **Word speed** for every word with 5+ letters, to show my slowest and
  fastest words.
- **Letter speed:** fastest / slowest single letters and two-letter
  combinations (bigrams).
- **Finger speed:** estimated speed per finger, using standard touch-typing
  finger positions on a QWERTY keyboard. _This is an estimate:_ the app cannot
  see which finger actually pressed a key, so it assumes standard touch-typing
  assignments.
- **History over time** so I can see improvement (daily totals and per-session
  records).

### Definitions

- **WPM** = (correct characters typed / 5) / minutes, the standard
  "5 characters = 1 word" measure. Time counts only while typing (pauses longer
  than a few seconds are not counted, so leaving the app open does not hurt).
- **Accuracy** = correct keystrokes / all character keystrokes. Backspace is not
  counted as a keystroke, but the mistake it fixes still counts.
- **Key timing** = time from the previous keystroke to this correct keystroke.
  Bigram timing uses consecutive correct keystrokes inside a word.

### Standard QWERTY finger map (for the estimate)

| Finger       | Keys                            |
| ------------ | ------------------------------- |
| Left pinky   | `` ` 1 q a z `` and Shift/Tab   |
| Left ring    | `2 w s x`                       |
| Left middle  | `3 e d c`                       |
| Left index   | `4 5 r t f g v b`               |
| Thumbs       | Space                           |
| Right index  | `6 7 y u h j n m`               |
| Right middle | `8 i k ,`                       |
| Right ring   | `9 o l .`                       |
| Right pinky  | `0 - = p [ ] ; ' / \` and Enter |

## Data model (first draft)

Stored in IndexedDB. Every record carries `updatedAt` so a future sync can
merge changes.

| Store        | Key                                    | Holds                                                               |
| ------------ | -------------------------------------- | ------------------------------------------------------------------- |
| `shelf`      | `bookId`                               | Books on Home, order, added date, yearly-reset flag                 |
| `progress`   | `[bookId, chapter]`                    | Completed verses, completed flag, last position                     |
| `notes`      | `id`                                   | `bookId`, chapter, verse, text, dates                               |
| `sessions`   | `id`                                   | One typing session: book, chapter, verse range, time, WPM, accuracy |
| `verseStats` | `[bookId, chapter, verse, sessionId]`  | WPM and accuracy for one verse in one session                       |
| `keyStats`   | `[kind, key]` (letter / bigram / word) | Running count, total time, errors                                   |
| `daily`      | `date`                                 | Totals per day for the history chart                                |
| `settings`   | `key`                                  | Scroll style and other preferences                                  |

Book progress and per-book stats are derived from `progress` and
`verseStats`. Export writes every store into one JSON file with a format
version; Import validates and replaces.

## Texts

See [TEXTS.md](TEXTS.md) for sources, licences and the data format. The
library contains:

- Old Testament (KJV, 39 books)
- New Testament (KJV, 27 books)
- Book of Mormon
- Doctrine and Covenants (sections 1–138, Official Declaration 1)
- Pearl of Great Price (Moses, Abraham, Joseph Smith—Matthew, Joseph
  Smith—History, Articles of Faith)
- Lectures on Faith (7 lectures, by numbered paragraph)
- Joseph Smith Translation (1867 Inspired Version), Old and New Testaments.
  Rebuilt from scans of the 1867 edition; books still being proofread are
  marked as drafts.

## Code layout

```
src/storage/     Storage interface + Dexie implementation (only place that touches IndexedDB)
src/typing/      Typing engine: character normalisation, cursor, mistakes, timing, stats maths
src/screens/     Home, Library, ChapterGrid, Typing, Stats, Settings
src/components/  Shared UI pieces (progress bar, verse view, charts)
public/texts/    Generated scripture JSON (committed)
scripts/         Download / build / check scripts for the texts
docs/            This plan and TEXTS.md
```

## Later (not v1)

- Accounts.
- A Go backend.
- Per-chapter and whole-book leaderboards.
- Syncing between devices.
- A desktop installer.
