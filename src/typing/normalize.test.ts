import { describe, expect, it } from 'vitest'
import { fingerFor } from './fingers'
import { isLetter, toTypeable, typedForm } from './normalize'

describe('typedForm', () => {
  it('converts curly quotes to straight quotes', () => {
    expect(typedForm('‘')).toBe("'")
    expect(typedForm('’')).toBe("'")
    expect(typedForm('“')).toBe('"')
    expect(typedForm('”')).toBe('"')
  })

  it('converts em and en dashes to a hyphen', () => {
    expect(typedForm('—')).toBe('-')
    expect(typedForm('–')).toBe('-')
  })

  it('converts an ellipsis to three dots', () => {
    expect(typedForm('…')).toBe('...')
  })

  it('converts non-breaking spaces to a normal space', () => {
    expect(typedForm(String.fromCharCode(0x00a0))).toBe(' ')
    expect(typedForm(String.fromCharCode(0x202f))).toBe(' ')
  })

  it('keeps plain keyboard characters', () => {
    for (const c of 'aZ09 .,;:\'"!?()[]-') expect(typedForm(c)).toBe(c)
  })

  it('strips accents', () => {
    expect(typedForm('é')).toBe('e')
  })

  it('returns empty for characters that cannot be typed', () => {
    expect(typedForm('€')).toBe('')
    expect(typedForm('©')).toBe('')
  })

  it('converts a whole string without changing plain text', () => {
    expect(toTypeable('Lord’s “word”—yea…')).toBe('Lord\'s "word"-yea...')
    expect(toTypeable('In the beginning')).toBe('In the beginning')
  })

  it('detects letters', () => {
    expect(isLetter('a')).toBe(true)
    expect(isLetter('Q')).toBe(true)
    expect(isLetter("'")).toBe(false)
    expect(isLetter(' ')).toBe(false)
  })
})

describe('fingerFor', () => {
  it('follows the QWERTY finger map', () => {
    expect(fingerFor('a')).toBe('left-pinky')
    expect(fingerFor('q')).toBe('left-pinky')
    expect(fingerFor('w')).toBe('left-ring')
    expect(fingerFor('e')).toBe('left-middle')
    expect(fingerFor('g')).toBe('left-index')
    expect(fingerFor('b')).toBe('left-index')
    expect(fingerFor(' ')).toBe('thumb')
    expect(fingerFor('h')).toBe('right-index')
    expect(fingerFor('m')).toBe('right-index')
    expect(fingerFor('k')).toBe('right-middle')
    expect(fingerFor(',')).toBe('right-middle')
    expect(fingerFor('l')).toBe('right-ring')
    expect(fingerFor('.')).toBe('right-ring')
    expect(fingerFor('p')).toBe('right-pinky')
    expect(fingerFor(';')).toBe('right-pinky')
    expect(fingerFor("'")).toBe('right-pinky')
    expect(fingerFor('-')).toBe('right-pinky')
    expect(fingerFor('\n')).toBe('right-pinky')
  })

  it('maps capitals and shifted symbols to their base key', () => {
    expect(fingerFor('A')).toBe('left-pinky')
    expect(fingerFor('L')).toBe('right-ring')
    expect(fingerFor(':')).toBe('right-pinky')
    expect(fingerFor('"')).toBe('right-pinky')
    expect(fingerFor('?')).toBe('right-pinky')
    expect(fingerFor('!')).toBe('left-pinky')
    expect(fingerFor('(')).toBe('right-ring')
    expect(fingerFor(')')).toBe('right-pinky')
  })
})
