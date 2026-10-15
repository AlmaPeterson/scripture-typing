// Standard touch-typing finger assignments on a QWERTY keyboard (docs/PLAN.md).
// The app cannot see which finger pressed a key, so per-finger figures are an
// estimate that assumes these assignments.

export type Finger =
  | 'left-pinky'
  | 'left-ring'
  | 'left-middle'
  | 'left-index'
  | 'thumb'
  | 'right-index'
  | 'right-middle'
  | 'right-ring'
  | 'right-pinky'

export const FINGERS: readonly Finger[] = [
  'left-pinky',
  'left-ring',
  'left-middle',
  'left-index',
  'thumb',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
]

export const FINGER_LABELS: Record<Finger, string> = {
  'left-pinky': 'Left pinky',
  'left-ring': 'Left ring',
  'left-middle': 'Left middle',
  'left-index': 'Left index',
  thumb: 'Thumbs',
  'right-index': 'Right index',
  'right-middle': 'Right middle',
  'right-ring': 'Right ring',
  'right-pinky': 'Right pinky',
}

const KEYS: Record<Finger, string> = {
  'left-pinky': '`1qaz',
  'left-ring': '2wsx',
  'left-middle': '3edc',
  'left-index': '45rtfgvb',
  thumb: ' ',
  'right-index': '67yuhjnm',
  'right-middle': '8ik,',
  'right-ring': '9ol.',
  'right-pinky': "0-=p[];'/\\\n",
}

// Shifted symbol -> the key it is on.
const SHIFTED: Record<string, string> = {
  '~': '`',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
}

const KEY_TO_FINGER = new Map<string, Finger>()
for (const finger of FINGERS) {
  for (const key of KEYS[finger]) KEY_TO_FINGER.set(key, finger)
}

/** The finger that types `ch` in standard touch typing, or undefined if unknown. */
export function fingerFor(ch: string): Finger | undefined {
  const base = SHIFTED[ch] ?? ch.toLowerCase()
  return KEY_TO_FINGER.get(base)
}
