import { describe, expect, it } from 'vitest'
import { TypingEngine, type InputResult, type VerseResult } from './engine'
import { accuracy, keyStatWpm, msPerCharToWpm, wpm, type KeyStatDelta } from './stats'

/** Types `text` one key every `step` ms starting at `t`. Returns the time after the last key. */
function type(engine: TypingEngine, text: string, t: number, step = 100, out?: InputResult[]) {
  for (const ch of text) {
    t += step
    const r = engine.input(ch === '\n' ? 'Enter' : ch, t)
    out?.push(r)
  }
  return t
}

function completed(results: InputResult[]): VerseResult[] {
  return results.flatMap((r) => (r.completedVerse ? [r.completedVerse] : []))
}

function stat(stats: KeyStatDelta[], kind: string, key: string) {
  return stats.find((s) => s.kind === kind && s.key === key)
}

describe('stats maths', () => {
  it('computes WPM as (chars / 5) per active minute', () => {
    expect(wpm(50, 60000)).toBe(10)
    expect(wpm(250, 30000)).toBe(100)
    expect(wpm(10, 0)).toBe(0)
  })

  it('computes accuracy as correct / all keystrokes', () => {
    expect(accuracy(9, 10)).toBe(0.9)
    expect(accuracy(0, 0)).toBe(1)
  })

  it('converts ms per char to WPM', () => {
    expect(msPerCharToWpm(200)).toBe(60)
    expect(keyStatWpm('word', 'hello', { count: 1, timedCount: 1, totalMs: 1000, errors: 0 })).toBe(
      60,
    )
    expect(keyStatWpm('letter', 'a', { count: 1, timedCount: 0, totalMs: 0, errors: 0 })).toBe(0)
  })
})

describe('TypingEngine layout', () => {
  it('does not type verse numbers and joins verses with one separator', () => {
    const e = new TypingEngine([
      { number: 1, text: 'In the' },
      { number: 2, text: 'And' },
    ])
    // "In the" + " " + "And"
    expect(e.length).toBe(6 + 1 + 3)
    expect(e.verses[0].separator).toBe(6) // the space ends verse 1
    expect(e.verses[1].separator).toBe(-1) // nothing after the last verse
    expect(e.expectedAt(6)).toBe(' ')
  })

  it('converts special characters at typing time but keeps the stored text', () => {
    const text = 'the Lord’s—yea…'
    const e = new TypingEngine([{ number: 1, text }])
    expect(e.verses[0].text).toBe(text)
    let typed = ''
    for (let p = 0; p < e.length; p++) typed += e.expectedAt(p)
    expect(typed).toBe("the Lord's-yea...")
    const ellipsis = e.verses[0].tokens.at(-1)!
    expect(ellipsis.display).toBe('…')
    expect(ellipsis.length).toBe(3)
  })

  it('skips characters that cannot be typed', () => {
    const e = new TypingEngine([{ number: 1, text: 'a€b' }])
    expect(e.length).toBe(2)
    type(e, 'ab', 0)
    expect(e.finished).toBe(true)
  })

  it('can start at a later verse; earlier verses are shown as done', () => {
    const e = new TypingEngine(
      [
        { number: 1, text: 'one' },
        { number: 2, text: 'two' },
        { number: 3, text: 'six' },
      ],
      { startVerse: 1 },
    )
    expect(e.verses[0].skipped).toBe(true)
    expect(e.verseDone(0)).toBe(true)
    expect(e.length).toBe(3 + 1 + 3) // no separator after the last verse
    expect(e.currentVerse).toBe(1)
    const results: InputResult[] = []
    type(e, 'two six', 0, 100, results)
    expect(completed(results).map((v) => v.verseNumber)).toEqual([2, 3])
    expect(e.finished).toBe(true)
  })
})

describe('TypingEngine typing', () => {
  it('advances on correct keys and finishes the chapter', () => {
    const e = new TypingEngine([{ number: 1, text: 'abc' }])
    const results: InputResult[] = []
    type(e, 'abc', 0, 100, results)
    expect(results.every((r) => r.accepted && r.correct)).toBe(true)
    expect(results[2].finished).toBe(true)
    expect(e.finished).toBe(true)
    expect(e.input('x', 1000).accepted).toBe(false)
  })

  it('accepts Space or Enter between verses', () => {
    const a = new TypingEngine([
      { number: 1, text: 'a' },
      { number: 2, text: 'b' },
    ])
    type(a, 'a b', 0)
    expect(a.finished).toBe(true)
    expect(a.errors).toBe(0)

    const b = new TypingEngine([
      { number: 1, text: 'a' },
      { number: 2, text: 'b' },
    ])
    type(b, 'a\nb', 0)
    expect(b.finished).toBe(true)
    expect(b.errors).toBe(0)
  })

  it('ignores non-character keys', () => {
    const e = new TypingEngine([{ number: 1, text: 'ab' }])
    expect(e.input('Shift', 0).accepted).toBe(false)
    expect(e.input('ArrowLeft', 0).accepted).toBe(false)
    expect(e.keystrokes).toBe(0)
  })

  it('marks a wrong key red and keeps going', () => {
    const e = new TypingEngine([{ number: 1, text: 'abcd' }])
    type(e, 'axc', 0)
    expect(e.cursor).toBe(3)
    expect(e.charState(0)).toBe('correct')
    expect(e.charState(1)).toBe('wrong')
    expect(e.typedAt(1)).toBe('x')
    expect(e.charState(2)).toBe('correct')
    expect(e.charState(3)).toBe('pending')
    expect(e.errors).toBe(1)
  })

  it('counts every mistake against accuracy, even when fixed with Backspace', () => {
    const e = new TypingEngine([{ number: 1, text: 'abcd' }])
    let t = type(e, 'ax', 0)
    expect(e.backspace((t += 100))).toBe(true)
    expect(e.charState(1)).toBe('pending')
    type(e, 'bcd', t)
    expect(e.finished).toBe(true)
    expect(e.charState(1)).toBe('corrected')
    expect(e.keystrokes).toBe(5) // Backspace is not a keystroke
    expect(e.correctKeystrokes).toBe(4)
    expect(e.errors).toBe(1)
    expect(e.accuracy).toBeCloseTo(0.8)
    expect(e.correctChars).toBe(4)
  })

  it('does not let a verse end on a wrong character', () => {
    const e = new TypingEngine([
      { number: 1, text: 'ab' },
      { number: 2, text: 'c' },
    ])
    const t = type(e, 'a', 0)
    const r = e.input('x', t + 100)
    expect(r.blocked).toBe(true)
    expect(r.completedVerse).toBeUndefined()
    expect(e.cursor).toBe(1)
    expect(e.blockedKey).toBe('x')
    expect(e.errors).toBe(1)
    expect(e.input('b', t + 200).completedVerse).toBeUndefined()
    expect(e.blockedKey).toBeNull()
    // The separator after the verse is blocked the same way.
    expect(e.input('z', t + 300).blocked).toBe(true)
    expect(e.cursor).toBe(2)
    const ok = e.input(' ', t + 400)
    expect(ok.completedVerse?.verseNumber).toBe(1)
    expect(e.blockedKey).toBeNull()
  })

  it('Backspace clears a blocked wrong key without deleting', () => {
    const e = new TypingEngine([{ number: 1, text: 'ab' }])
    type(e, 'ax', 0)
    expect(e.blockedKey).toBe('x')
    e.backspace(1000)
    expect(e.blockedKey).toBeNull()
    expect(e.cursor).toBe(1)
  })

  it('locks completed verses against Backspace', () => {
    const e = new TypingEngine([
      { number: 1, text: 'ab' },
      { number: 2, text: 'cd' },
    ])
    let t = type(e, 'ab', 0)
    expect(e.backspace((t += 100))).toBe(true) // verse 1 is done only after its space
    t = type(e, 'b ', t)
    expect(e.backspace((t += 100))).toBe(false)
    t = type(e, 'c', t)
    expect(e.backspace((t += 100))).toBe(true)
    expect(e.backspace(t + 100)).toBe(false)
    expect(e.cursor).toBe(3)
  })

  it('Ctrl+Backspace deletes back to the start of the word', () => {
    const e = new TypingEngine([{ number: 1, text: 'the lord god' }])
    let t = type(e, 'the lo', 0)
    e.backspaceWord((t += 100))
    expect(e.cursor).toBe(4)
    t = type(e, 'lord ', t)
    e.backspaceWord(t + 100)
    expect(e.cursor).toBe(4)
  })

  it('reports each completed verse with its own counts', () => {
    const e = new TypingEngine([
      { number: 1, text: 'ab' },
      { number: 2, text: 'cd' },
    ])
    const results: InputResult[] = []
    type(e, 'ab ', 0, 100, results)
    type(e, 'xd', 300, 100, results) // wrong 'x' instead of 'c', left unfixed
    const [v1, v2] = completed(results)
    expect(v1).toMatchObject({ verseNumber: 1, correctChars: 3, keystrokes: 3, errors: 0 })
    expect(v1.accuracy).toBe(1)
    expect(v2).toMatchObject({ verseNumber: 2, correctChars: 1, keystrokes: 2, errors: 1 })
    expect(v2.accuracy).toBeCloseTo(1 / 2)
    expect(e.verseDone(0)).toBe(true)
    expect(e.verseDone(1)).toBe(true)
    expect(e.resultFor(0)).toEqual(v1)
    expect(e.resultFor(1)).toEqual(v2)
  })
})

describe('TypingEngine timing', () => {
  it('computes WPM from correct characters and active time', () => {
    const e = new TypingEngine([{ number: 1, text: 'abcdefghijk' }])
    // 11 keys 100ms apart; the first key has no previous key so adds no time.
    type(e, 'abcdefghijk', 0, 100)
    expect(e.activeMs).toBe(1000)
    expect(e.correctChars).toBe(11)
    expect(e.wpm).toBeCloseTo(11 / 5 / (1000 / 60000))
  })

  it('does not count pauses longer than the idle threshold', () => {
    const e = new TypingEngine([{ number: 1, text: 'abcd' }], { idleMs: 5000 })
    let t = type(e, 'ab', 0, 200) // 200ms counted
    t += 60000 // a minute away
    e.input('c', t)
    type(e, 'd', t, 300)
    expect(e.activeMs).toBe(500)
  })

  it('splits active time by verse', () => {
    const e = new TypingEngine([
      { number: 1, text: 'ab' },
      { number: 2, text: 'cd' },
    ])
    const results: InputResult[] = []
    type(e, 'ab cd', 0, 100, results)
    const [v1, v2] = completed(results)
    expect(v1.activeMs).toBe(200) // b + separator
    expect(v2.activeMs).toBe(200) // c + d
    expect(v1.wpm).toBeCloseTo(wpm(3, 200))
    expect(v2.wpm).toBeCloseTo(wpm(2, 200))
  })

  it('restarts the live verse WPM at each verse and keeps the chapter WPM', () => {
    const e = new TypingEngine([
      { number: 1, text: 'abcde' },
      { number: 2, text: 'fghij' },
    ])
    expect(e.verseWpm).toBe(0)
    let t = type(e, 'abcd', 0, 100)
    expect(e.verseWpm).toBeCloseTo(wpm(4, 300))
    t = type(e, 'e', t, 100)
    // The cursor is on verse 1's separator, so verse 1 is still the live one.
    expect(e.currentVerse).toBe(0)
    expect(e.verseWpm).toBeCloseTo(wpm(5, 400))
    t = type(e, ' ', t, 200) // verse 1: 6 chars in 600ms
    // Verse 1 is done: the cursor is at the start of verse 2, nothing typed there yet.
    expect(e.currentVerse).toBe(1)
    expect(e.verseWpm).toBe(0)
    expect(e.verseActiveMs).toBe(0)
    expect(e.wpm).toBeCloseTo(wpm(6, 600))
    // Verse 2 typed slower: 5 chars, 200ms apart.
    const results: InputResult[] = []
    type(e, 'fghij', t, 200, results)
    expect(e.finished).toBe(true)
    expect(e.verseActiveMs).toBe(1000)
    expect(e.verseWpm).toBeCloseTo(wpm(5, 1000))
    expect(e.verseWpm).toBeCloseTo(completed(results)[0].wpm)
    // The chapter numbers cover both verses.
    expect(e.activeMs).toBe(1600)
    expect(e.wpm).toBeCloseTo(wpm(11, 1600))
  })

  it('counts only correct characters and active time in the live verse WPM', () => {
    const e = new TypingEngine([{ number: 1, text: 'abcdef' }], { idleMs: 5000 })
    let t = type(e, 'abx', 0, 100) // x is wrong
    expect(e.verseWpm).toBeCloseTo(wpm(2, 200))
    e.backspace((t += 100))
    t += 60000 // a long pause is not counted
    type(e, 'cdef', t, 100)
    expect(e.verseActiveMs).toBe(300 + 300)
    expect(e.verseWpm).toBeCloseTo(wpm(6, 600))
  })

  it('counts Backspace time as active time', () => {
    const e = new TypingEngine([{ number: 1, text: 'abc' }])
    let t = type(e, 'ax', 0, 100)
    e.backspace((t += 100))
    type(e, 'bc', t, 100)
    expect(e.activeMs).toBe(400)
  })
})

describe('TypingEngine key stats', () => {
  it('records letter timing for correct keys and errors for wrong ones', () => {
    const e = new TypingEngine([{ number: 1, text: 'Aba' }])
    let t = 0
    e.input('A', (t += 100)) // first key: counted, not timed
    e.input('x', (t += 150)) // wrong where 'b' expected
    e.backspace((t += 100))
    e.input('b', (t += 250))
    e.input('a', t + 120)
    const stats = e.takeKeyStats()
    expect(stat(stats, 'letter', 'a')).toEqual({
      kind: 'letter',
      key: 'a',
      count: 2,
      timedCount: 1,
      totalMs: 120,
      errors: 0,
    })
    expect(stat(stats, 'letter', 'b')).toMatchObject({
      count: 1,
      timedCount: 1,
      totalMs: 250,
      errors: 1,
    })
    expect(e.takeKeyStats()).toEqual([]) // cleared after taking
  })

  it('records bigrams only for consecutive correct keys inside a word', () => {
    const e = new TypingEngine([{ number: 1, text: 'the ox' }])
    const t = type(e, 'th', 0, 100)
    e.input('x', t + 100) // wrong 'e': bigram "he" error
    e.backspace(t + 200)
    e.input('e', t + 300) // after Backspace: no bigram sample
    type(e, ' ox', t + 300, 100)
    const stats = e.takeKeyStats()
    expect(stat(stats, 'bigram', 'th')).toMatchObject({ count: 1, timedCount: 1, totalMs: 100 })
    expect(stat(stats, 'bigram', 'he')).toMatchObject({ count: 0, errors: 1 })
    expect(stat(stats, 'bigram', 'ox')).toMatchObject({ count: 1 })
    expect(stat(stats, 'bigram', 'e ')).toBeUndefined()
    expect(stat(stats, 'bigram', ' o')).toBeUndefined()
  })

  it('records words of 5+ letters with their whole-word time', () => {
    const e = new TypingEngine([{ number: 1, text: 'In the beginning God' }])
    let t = type(e, 'In the ', 0, 100)
    // "beginning": 9 letters, 100ms each, timed from the space before it
    t = type(e, 'beginning', t, 100)
    type(e, ' God', t, 100)
    const stats = e.takeKeyStats()
    expect(stat(stats, 'word', 'beginning')).toMatchObject({
      count: 1,
      timedCount: 1,
      totalMs: 900,
      errors: 0,
    })
    expect(stat(stats, 'word', 'god')).toBeUndefined()
    expect(stats.filter((s) => s.kind === 'word')).toHaveLength(1)
  })

  it('counts a fixed mistake in a word as a word error', () => {
    const e = new TypingEngine([{ number: 1, text: 'x Lords' }])
    let t = type(e, 'x Lor', 0, 100)
    e.input('t', (t += 100))
    e.backspace((t += 100))
    type(e, 'ds', t, 100)
    const w = stat(e.takeKeyStats(), 'word', 'lords')
    expect(w).toMatchObject({ count: 1, timedCount: 1, errors: 1, totalMs: 700 })
  })

  it('does not time a word with a long pause inside it', () => {
    const e = new TypingEngine([{ number: 1, text: 'x moses' }], { idleMs: 5000 })
    let t = type(e, 'x mo', 0, 100)
    t += 10000
    e.input('s', t)
    type(e, 'es', t, 100)
    expect(stat(e.takeKeyStats(), 'word', 'moses')).toMatchObject({ count: 1, timedCount: 0 })
  })

  it('does not record a word left with an uncorrected mistake', () => {
    const e = new TypingEngine([{ number: 1, text: 'moses x' }])
    type(e, 'mxses x', 0, 100)
    expect(stat(e.takeKeyStats(), 'word', 'moses')).toBeUndefined()
  })

  it('records estimated finger timing for every key', () => {
    const e = new TypingEngine([{ number: 1, text: 'a; a' }])
    type(e, 'a; a', 0, 100)
    const stats = e.takeKeyStats()
    expect(stat(stats, 'finger', 'left-pinky')).toMatchObject({ count: 2, timedCount: 1 })
    expect(stat(stats, 'finger', 'right-pinky')).toMatchObject({ count: 1, timedCount: 1 })
    expect(stat(stats, 'finger', 'thumb')).toMatchObject({ count: 1, totalMs: 100 })
  })
})
