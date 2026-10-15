# Scripture Typer

_Working name._ A typing game where you type the scriptures instead of just
reading them, so you improve your typing and learn the scriptures at the same
time. It tracks your progress; it is not a race.

The first version has no accounts or backend. It runs in the browser, keeps
all your data on your device (IndexedDB), works offline, and can be installed
as an app from Chrome or Edge on Windows and Linux.

- Plan and app design: [docs/PLAN.md](docs/PLAN.md)
- Scripture sources, licences and data format: [docs/TEXTS.md](docs/TEXTS.md)

> Status: v1 app built (Home, Library, Course, Chapter grid, Typing, Stats,
> Settings). JST books marked as drafts are labelled in the app.

### Using it

- **Library** → add a course to Home. Its books are downloaded so it works
  offline.
- **Home** → **Continue** goes to the verse after the last one you completed.
- **Typing**: just type. Verse numbers are skipped; press Space or Enter
  between verses. Curly quotes, dashes and ellipses are typed as `'` `"` `-` and
  `...`. Backspace fixes a mistake (it still counts against accuracy);
  Ctrl+Backspace deletes a word; Esc pauses; Enter resumes. Hover a verse (or
  Tab to its note button) to add a note.
- **Settings**: theme, text size, scroll style, the per-course January 1 reset,
  and Export / Import / Delete of all data (one JSON file).

## Run it locally

Needs Node.js 20.19+ (or 22.12+) and npm.

```sh
npm install
npm run dev        # dev server at http://localhost:5173/scripture-typing/
```

Other scripts:

```sh
npm run build      # type-check and build to dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint
npm test           # Vitest unit and component tests (jsdom + fake-indexeddb)
npm run format     # Prettier (write); format:check to verify
```

### Rebuilding the scripture data

The generated JSON in `public/texts/` is committed, so you only need this if
you change the conversion scripts. Needs Python 3.10+.

```sh
npm run texts:download   # download sources into raw/ (git-ignored)
npm run texts:build      # write public/texts/
npm run texts:check      # validate book/chapter counts, empty verses, markup
```

## Deployment

The site is hosted on GitHub Pages at
`https://<owner>.github.io/scripture-typing/`.

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which installs dependencies, lints, builds, and publishes `dist/` to Pages.
It can also be run by hand from the Actions tab.

Vite's `base` is set to `/scripture-typing/` in `vite.config.ts` so asset
URLs, the web manifest and the service worker scope work under the Pages
sub-path. If the repository is renamed, update `base` to match.

The repository's Pages setting must use **GitHub Actions** as the source
(Settings → Pages → Build and deployment).
