// The typing engine: plain TypeScript, no React, no storage.
//
// A chapter is a list of verses. Each verse is turned into a list of
// "positions", one per character the user must type (after converting
// special characters, see normalize.ts). Verse numbers are never typed.
// Between two verses there is one separator position that accepts Space or
// Enter.
//
// Mistakes: a wrong key is shown red and the cursor moves on; the user can
// keep typing or press Backspace. Every wrong keystroke counts against
// accuracy, even if fixed. The last character of a verse must be typed
// correctly before the verse is complete, so a verse never ends on a typo
// that can no longer be fixed. Completed verses are locked: Backspace cannot
// go back into them.
//
// Time is passed in by the caller (ms, e.g. performance.now()), so the engine
// is deterministic and easy to test.

import { fingerFor } from './fingers'
import { isLetter, typedForm } from './normalize'
import { IDLE_THRESHOLD_MS, accuracy, wpm, type KeyStatDelta, type KeyStatKind } from './stats'

export interface VerseInput {
  number: number
  text: string
}

/** One character of the stored text and the positions it is typed as. */
export interface Token {
  display: string
  /** Index of its first position. */
  start: number
  /** Number of positions (0 = shown but not typed, 3 for "…"). */
  length: number
}

export interface VerseLayout {
  index: number
  number: number
  text: string
  /** Verse before the starting verse: shown as already done, not typed now. */
  skipped: boolean
  tokens: Token[]
  /** First position of the verse (its separator, if it has one). */
  start: number
  /** One past the last position. */
  end: number
  /** Position of the separator before this verse, or -1. */
  separator: number
}

interface Position {
  expected: string
  verse: number
  separator: boolean
  word: number
}

interface WordSpan {
  start: number
  end: number
  key: string
}

export type CharState = 'pending' | 'correct' | 'corrected' | 'wrong'

export interface VerseResult {
  verseIndex: number
  verseNumber: number
  correctChars: number
  keystrokes: number
  correctKeystrokes: number
  errors: number
  activeMs: number
  wpm: number
  accuracy: number
}

export interface InputResult {
  /** False if the key was ignored (not a character, or the chapter is finished). */
  accepted: boolean
  correct: boolean
  /** A wrong key on the last character of a verse: counted, but the cursor does not move. */
  blocked: boolean
  completedVerse?: VerseResult
  finished: boolean
}

export interface EngineOptions {
  /** Index (not number) of the verse to start typing at. Earlier verses are shown as done. */
  startVerse?: number
  /** Gaps longer than this between keystrokes are not counted as time. */
  idleMs?: number
}

interface VerseCounters {
  keystrokes: number
  correctKeystrokes: number
  errors: number
  activeMs: number
}

interface WordState {
  word: number
  startTime: number | null
  timed: boolean
  hadError: boolean
}

const IGNORED: InputResult = { accepted: false, correct: false, blocked: false, finished: false }

export class TypingEngine {
  readonly verses: VerseLayout[]
  readonly startVerse: number
  private readonly positions: Position[] = []
  private readonly words: WordSpan[] = []
  private readonly typed: (string | null)[]
  private readonly everWrong: boolean[]
  private readonly counters: VerseCounters[]
  private readonly idleMs: number

  private cursorPos = 0
  private lockFloor = 0
  private lastKeyTime: number | null = null
  private prevKey: { pos: number; correct: boolean } | null = null
  private word: WordState | null = null
  private pendingStats = new Map<string, KeyStatDelta>()

  /** Wrong key typed on a blocked position (last char of a verse), shown until the next key. */
  blockedKey: string | null = null

  keystrokes = 0
  correctKeystrokes = 0
  errors = 0
  activeMs = 0
  private correctCount = 0

  constructor(verses: VerseInput[], options: EngineOptions = {}) {
    this.idleMs = options.idleMs ?? IDLE_THRESHOLD_MS
    let start = Math.max(0, Math.min(options.startVerse ?? 0, verses.length))
    // A verse with nothing typeable cannot be typed; start after it.
    while (start < verses.length && !hasTypeable(verses[start].text)) start++
    this.startVerse = start

    this.verses = verses.map((v, index) => {
      const layout: VerseLayout = {
        index,
        number: v.number,
        text: v.text,
        skipped: index < start,
        tokens: [],
        start: this.positions.length,
        end: this.positions.length,
        separator: -1,
      }
      if (index < start) return layout
      if (index > start) {
        layout.separator = this.positions.length
        this.positions.push({ expected: ' ', verse: index, separator: true, word: -1 })
      }
      for (const ch of v.text) {
        const form = typedForm(ch)
        layout.tokens.push({ display: ch, start: this.positions.length, length: form.length })
        for (const c of form) {
          this.positions.push({ expected: c, verse: index, separator: false, word: -1 })
        }
      }
      layout.end = this.positions.length
      this.findWords(layout)
      return layout
    })

    this.typed = new Array<string | null>(this.positions.length).fill(null)
    this.everWrong = new Array<boolean>(this.positions.length).fill(false)
    this.counters = verses.map(() => ({
      keystrokes: 0,
      correctKeystrokes: 0,
      errors: 0,
      activeMs: 0,
    }))
  }

  private findWords(layout: VerseLayout) {
    let runStart = -1
    for (let p = layout.start; p <= layout.end; p++) {
      const letter = p < layout.end && isLetter(this.positions[p].expected)
      if (letter && runStart < 0) runStart = p
      if (!letter && runStart >= 0) {
        if (p - runStart >= 5) {
          const id = this.words.length
          let key = ''
          for (let q = runStart; q < p; q++) {
            this.positions[q].word = id
            key += this.positions[q].expected.toLowerCase()
          }
          this.words.push({ start: runStart, end: p, key })
        }
        runStart = -1
      }
    }
  }

  // ---- Read-only state for the UI ----

  get length(): number {
    return this.positions.length
  }

  get cursor(): number {
    return this.cursorPos
  }

  get finished(): boolean {
    return this.cursorPos >= this.positions.length
  }

  /** Index of the verse the cursor is in (the last verse once finished). */
  get currentVerse(): number {
    if (this.positions.length === 0) return Math.max(0, this.verses.length - 1)
    const p = Math.min(this.cursorPos, this.positions.length - 1)
    return this.positions[p].verse
  }

  /** Characters currently typed correctly (completed verses included). */
  get correctChars(): number {
    return this.correctCount
  }

  get wpm(): number {
    return wpm(this.correctCount, this.activeMs)
  }

  get accuracy(): number {
    return accuracy(this.correctKeystrokes, this.keystrokes)
  }

  /**
   * Live WPM for the verse the cursor is in (the last verse once finished):
   * its correct characters so far over its own active time. It starts again
   * from 0 at each verse; the separator before a verse counts towards that
   * verse, as in its VerseResult. Pauses longer than `idleMs` are not counted.
   */
  get verseWpm(): number {
    const index = this.currentVerse
    const c = this.counters[index]
    return c ? wpm(this.correctCharsIn(index), c.activeMs) : 0
  }

  /** Active time so far in the verse the cursor is in, in ms. */
  get verseActiveMs(): number {
    return this.counters[this.currentVerse]?.activeMs ?? 0
  }

  expectedAt(p: number): string {
    return this.positions[p].expected
  }

  charState(p: number): CharState {
    const t = this.typed[p]
    if (t === null) return 'pending'
    if (this.isCorrect(p, t)) return this.everWrong[p] ? 'corrected' : 'correct'
    return 'wrong'
  }

  typedAt(p: number): string | null {
    return this.typed[p]
  }

  /** Whether the verse at `index` is complete in this session (or was skipped as already done). */
  verseDone(index: number): boolean {
    const v = this.verses[index]
    if (v.skipped) return true
    return this.cursorPos >= v.end && v.end > v.start
  }

  // ---- Input ----

  /**
   * Handle one key. `key` is a single character, or "Enter".
   * `time` is in ms.
   */
  input(key: string, time: number): InputResult {
    if (this.finished) return IGNORED
    let ch: string
    if (key === 'Enter' || key === '\n') ch = '\n'
    else if (key.length === 1) ch = key
    else return IGNORED

    const p = this.cursorPos
    const pos = this.positions[p]
    const verse = this.verses[pos.verse]
    const counters = this.counters[pos.verse]
    const correct = this.isCorrect(p, ch)
    const prevTime = this.lastKeyTime
    const dt = prevTime === null ? null : time - prevTime
    const timed = dt !== null && dt >= 0 && dt <= this.idleMs
    if (timed) {
      this.activeMs += dt
      counters.activeMs += dt
    }
    this.lastKeyTime = time

    this.keystrokes++
    counters.keystrokes++
    if (correct) {
      this.correctKeystrokes++
      counters.correctKeystrokes++
    } else {
      this.errors++
      counters.errors++
      this.everWrong[p] = true
    }

    this.recordKeyStats(p, correct, timed ? dt : null)
    this.trackWord(p, correct, time, prevTime, timed)

    const last = p === verse.end - 1
    if (!correct && last) {
      this.blockedKey = ch
      this.prevKey = { pos: p, correct: false }
      return { accepted: true, correct: false, blocked: true, finished: false }
    }
    this.blockedKey = null

    this.typed[p] = ch
    if (correct) this.correctCount++
    this.cursorPos = p + 1
    this.prevKey = { pos: p, correct }

    let completedVerse: VerseResult | undefined
    if (this.cursorPos === verse.end) {
      completedVerse = this.verseResult(pos.verse)
      this.lockFloor = this.cursorPos
      this.word = null
    }
    return { accepted: true, correct, blocked: false, completedVerse, finished: this.finished }
  }

  /** Delete the last typed character. Returns false if there is nothing to delete. */
  backspace(time: number): boolean {
    if (this.finished || this.cursorPos <= this.lockFloor) {
      if (this.blockedKey !== null) {
        this.blockedKey = null
        return true
      }
      return false
    }
    this.countTime(time, this.positions[this.cursorPos - 1].verse)
    if (this.blockedKey !== null) {
      this.blockedKey = null
      return true
    }
    this.removeOne()
    return true
  }

  /** Delete back to the start of the current word (Ctrl+Backspace). */
  backspaceWord(time: number): boolean {
    if (this.finished || this.cursorPos <= this.lockFloor) return this.backspace(time)
    this.countTime(time, this.positions[this.cursorPos - 1].verse)
    this.blockedKey = null
    // Skip spaces just typed, then the word itself.
    while (this.cursorPos > this.lockFloor && this.positions[this.cursorPos - 1].expected === ' ') {
      this.removeOne()
    }
    while (this.cursorPos > this.lockFloor && this.positions[this.cursorPos - 1].expected !== ' ') {
      this.removeOne()
    }
    return true
  }

  /** Letter, bigram, word and finger totals collected since the last call. */
  takeKeyStats(): KeyStatDelta[] {
    const out = [...this.pendingStats.values()]
    this.pendingStats = new Map()
    return out
  }

  // ---- Internals ----

  private isCorrect(p: number, ch: string): boolean {
    const pos = this.positions[p]
    return ch === pos.expected || (pos.separator && ch === '\n')
  }

  private countTime(time: number, verse: number) {
    const prev = this.lastKeyTime
    if (prev !== null) {
      const dt = time - prev
      if (dt >= 0 && dt <= this.idleMs) {
        this.activeMs += dt
        this.counters[verse].activeMs += dt
      } else if (this.word) {
        this.word.timed = false
      }
    }
    this.lastKeyTime = time
  }

  private removeOne() {
    const p = this.cursorPos - 1
    const t = this.typed[p]
    if (t !== null && this.isCorrect(p, t)) this.correctCount--
    this.typed[p] = null
    this.cursorPos = p
    this.prevKey = null
    if (this.word && p < this.words[this.word.word].start) this.word = null
  }

  private verseResult(index: number): VerseResult {
    const v = this.verses[index]
    const c = this.counters[index]
    const correctChars = this.correctCharsIn(index)
    return {
      verseIndex: index,
      verseNumber: v.number,
      correctChars,
      keystrokes: c.keystrokes,
      correctKeystrokes: c.correctKeystrokes,
      errors: c.errors,
      activeMs: c.activeMs,
      wpm: wpm(correctChars, c.activeMs),
      accuracy: accuracy(c.correctKeystrokes, c.keystrokes),
    }
  }

  /** Characters of a verse currently typed correctly. */
  private correctCharsIn(index: number): number {
    const v = this.verses[index]
    const end = Math.min(v.end, this.cursorPos)
    let n = 0
    for (let p = v.start; p < end; p++) {
      const t = this.typed[p]
      if (t !== null && this.isCorrect(p, t)) n++
    }
    return n
  }

  private bump(kind: KeyStatKind, key: string, correct: boolean, dt: number | null) {
    const id = `${kind}\u0000${key}`
    let s = this.pendingStats.get(id)
    if (!s) {
      s = { kind, key, count: 0, timedCount: 0, totalMs: 0, errors: 0 }
      this.pendingStats.set(id, s)
    }
    if (correct) {
      s.count++
      if (dt !== null) {
        s.timedCount++
        s.totalMs += dt
      }
    } else {
      s.errors++
    }
  }

  private recordKeyStats(p: number, correct: boolean, dt: number | null) {
    const expected = this.positions[p].expected
    const finger = fingerFor(expected)
    if (finger) this.bump('finger', finger, correct, dt)
    if (!isLetter(expected)) return
    this.bump('letter', expected.toLowerCase(), correct, dt)
    const prev = this.prevKey
    if (prev && prev.pos === p - 1 && prev.correct && isLetter(this.positions[p - 1].expected)) {
      const bigram = (this.positions[p - 1].expected + expected).toLowerCase()
      this.bump('bigram', bigram, correct, dt)
    }
  }

  private trackWord(
    p: number,
    correct: boolean,
    time: number,
    prevTime: number | null,
    timed: boolean,
  ) {
    const id = this.positions[p].word
    if (id < 0) return
    const span = this.words[id]
    if (!this.word || this.word.word !== id) {
      if (p !== span.start) return
      this.word = { word: id, startTime: prevTime, timed, hadError: false }
    } else if (!timed) {
      this.word.timed = false
    }
    if (!correct) this.word.hadError = true
    if (!correct || p !== span.end - 1) return
    for (let q = span.start; q < span.end - 1; q++) {
      const t = this.typed[q]
      if (t === null || !this.isCorrect(q, t)) return
    }
    const w = this.word
    const sample = w.timed && w.startTime !== null ? time - w.startTime : null
    const s = this.getWordStat(span.key)
    s.count++
    if (sample !== null) {
      s.timedCount++
      s.totalMs += sample
    }
    if (w.hadError) s.errors++
    this.word = null
  }

  private getWordStat(key: string): KeyStatDelta {
    const id = `word\u0000${key}`
    let s = this.pendingStats.get(id)
    if (!s) {
      s = { kind: 'word', key, count: 0, timedCount: 0, totalMs: 0, errors: 0 }
      this.pendingStats.set(id, s)
    }
    return s
  }
}

function hasTypeable(text: string): boolean {
  for (const ch of text) if (typedForm(ch) !== '') return true
  return false
}
