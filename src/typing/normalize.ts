// Converts scripture characters into what is typed on a plain keyboard.
// The stored text is never changed; this runs at typing time only.

// Code point -> what is typed. Written as numbers so invisible spaces stay
// readable in the source (Prettier turns \u escapes into literal characters).
const REPLACEMENT_LIST: [number, string][] = [
  // Single quotes and apostrophes: ‘ ’ ‚ ‛ ′
  [0x2018, "'"],
  [0x2019, "'"],
  [0x201a, "'"],
  [0x201b, "'"],
  [0x2032, "'"],
  // Double quotes: “ ” „ ‟ ″ « »
  [0x201c, '"'],
  [0x201d, '"'],
  [0x201e, '"'],
  [0x201f, '"'],
  [0x2033, '"'],
  [0x00ab, '"'],
  [0x00bb, '"'],
  // Hyphens and dashes: ‐ ‑ ‒ – — ― −
  [0x2010, '-'],
  [0x2011, '-'],
  [0x2012, '-'],
  [0x2013, '-'],
  [0x2014, '-'],
  [0x2015, '-'],
  [0x2212, '-'],
  // Ellipsis …
  [0x2026, '...'],
  // No-break and thin spaces, tab, newlines
  [0x00a0, ' '],
  [0x2007, ' '],
  [0x2009, ' '],
  [0x202f, ' '],
  [0x09, ' '],
  [0x0a, ' '],
  [0x0d, ' '],
]

const REPLACEMENTS = new Map(
  REPLACEMENT_LIST.map(([code, out]) => [String.fromCharCode(code), out]),
)

function isPlainKey(s: string): boolean {
  for (const c of s) {
    const code = c.charCodeAt(0)
    if (code < 0x20 || code > 0x7e) return false
  }
  return true
}

/**
 * What the user types for one character of the stored text.
 * Returns '' for a character that cannot be typed on a plain keyboard
 * (it is shown but skipped by the cursor, like a verse number).
 */
export function typedForm(ch: string): string {
  const replaced = REPLACEMENTS.get(ch)
  if (replaced !== undefined) return replaced
  if (isPlainKey(ch)) return ch
  // Letters with accents ("é") are typed without them.
  const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
  if (stripped && isPlainKey(stripped)) return stripped
  return ''
}

/** Typed form of a whole string. */
export function toTypeable(text: string): string {
  let out = ''
  for (const ch of text) out += typedForm(ch)
  return out
}

export function isLetter(ch: string): boolean {
  return /^[a-zA-Z]$/.test(ch)
}
