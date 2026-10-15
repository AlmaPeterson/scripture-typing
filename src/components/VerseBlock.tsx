import { memo, useState, type ReactNode } from 'react'
import type { Note } from '../storage'
import type { TypingEngine, VerseLayout } from '../typing'

export type VerseMode = 'skipped' | 'done' | 'current' | 'pending'

interface Props {
  layout: VerseLayout
  engine: TypingEngine
  mode: VerseMode
  /** Changes on every keystroke for the current verse only, so other verses do not re-render. */
  tick: number
  unitLabel: string
  note: Note | undefined
  editing: boolean
  onEditNote: (verse: number) => void
  onSaveNote: (verse: number, text: string) => void
  onCancelNote: () => void
}

function VerseBlockImpl({
  layout,
  engine,
  mode,
  unitLabel,
  note,
  editing,
  onEditNote,
  onSaveNote,
  onCancelNote,
}: Props) {
  const label = unitLabel === 'Lecture' ? 'paragraph' : 'verse'
  return (
    <div className={`verse verse-${mode}`} data-verse={layout.number}>
      <div className="verse-line">
        <span className="verse-num" aria-hidden="true">
          {layout.number}
        </span>
        <span className="verse-text">
          {mode === 'current' || mode === 'done' ? renderTyped(layout, engine) : layout.text}
        </span>
        <button
          type="button"
          className={`note-button ${note ? 'has-note' : ''}`}
          onClick={() => onEditNote(layout.number)}
          aria-label={`${note ? 'Edit' : 'Add'} note on ${label} ${layout.number}`}
          title={note ? 'Edit note' : 'Add a note'}
        >
          <NoteIcon />
        </button>
      </div>
      {editing ? (
        <NoteEditor
          initial={note?.text ?? ''}
          label={`Note on ${label} ${layout.number}`}
          onSave={(text) => onSaveNote(layout.number, text)}
          onCancel={onCancelNote}
        />
      ) : (
        note && (
          <p className="note-text">
            <span className="visually-hidden">Note: </span>
            {note.text}
          </p>
        )
      )}
    </div>
  )
}

export const VerseBlock = memo(VerseBlockImpl)

function renderTyped(layout: VerseLayout, engine: TypingEngine): ReactNode[] {
  const cursor = engine.cursor
  const out: ReactNode[] = []
  if (layout.separator >= 0) {
    const p = layout.separator
    const state = engine.charState(p)
    const caret = cursor === p
    if (caret || state === 'wrong') {
      out.push(
        <span
          key="sep"
          className={`ch sep ${caret ? 'caret' : ''} ${state === 'wrong' ? 'wrong' : ''} ${caret && engine.blockedKey !== null ? 'blocked' : ''}`}
          data-caret={caret || undefined}
          title={caret ? 'Press Space or Enter' : undefined}
        >
          ␣
        </span>,
      )
    }
  }
  layout.tokens.forEach((tok, i) => {
    if (tok.length === 0) {
      out.push(
        <span key={i} className="ch skip" title="Not typed">
          {tok.display}
        </span>,
      )
      return
    }
    let pending = false
    let wrong = false
    let corrected = false
    for (let p = tok.start; p < tok.start + tok.length; p++) {
      const s = engine.charState(p)
      if (s === 'pending') pending = true
      else if (s === 'wrong') wrong = true
      else if (s === 'corrected') corrected = true
    }
    const caret = cursor >= tok.start && cursor < tok.start + tok.length
    let cls = 'ch'
    if (wrong) cls += ' wrong'
    else if (!pending) cls += corrected ? ' corrected' : ' correct'
    if (caret) cls += ' caret'
    if (caret && engine.blockedKey !== null) cls += ' blocked'
    out.push(
      <span key={i} className={cls} data-caret={caret || undefined}>
        {tok.display}
      </span>,
    )
  })
  return out
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 3h9l3 3v11H4z M13 3v3h3 M7 9h6 M7 12h6 M7 15h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NoteEditor({
  initial,
  label,
  onSave,
  onCancel,
}: {
  initial: string
  label: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  return (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(text)
      }}
    >
      <label className="visually-hidden" htmlFor="note-input">
        {label}
      </label>
      <textarea
        id="note-input"
        autoFocus
        rows={3}
        value={text}
        placeholder="Write a private note…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            onSave(text)
          }
        }}
      />
      <div className="note-actions">
        <button type="submit" className="button button-primary">
          Save note
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        {initial && (
          <button type="button" className="button button-quiet" onClick={() => onSave('')}>
            Delete note
          </button>
        )}
        <span className="hint">Ctrl+Enter to save · Esc to cancel</span>
      </div>
    </form>
  )
}
