// Standard touch-typing finger assignments (docs/PLAN.md). Fingers belong to
// physical key positions; a keyboard layout decides which character is on
// each position. The app cannot see which finger pressed a key, so
// per-finger figures are an estimate that assumes these assignments.

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

export type KeyboardLayout =
  'qwerty' | 'dvorak' | 'colemak' | 'colemak-dh' | 'workman' | 'qwertz' | 'azerty'

export const KEYBOARD_LAYOUTS: { value: KeyboardLayout; label: string }[] = [
  { value: 'qwerty', label: 'QWERTY' },
  { value: 'dvorak', label: 'Dvorak' },
  { value: 'colemak', label: 'Colemak' },
  { value: 'colemak-dh', label: 'Colemak-DH' },
  { value: 'workman', label: 'Workman' },
  { value: 'qwertz', label: 'QWERTZ (German)' },
  { value: 'azerty', label: 'AZERTY (French)' },
]

// Fingers of each physical key, by row, as indexes into FINGERS. Rows are the
// number row (from the key left of 1), the top row, the home row and the
// bottom row, left to right, as on a US keyboard. The extra key some rows
// have on ISO keyboards is typed with the pinky.
const ROW_FINGERS = [
  [0, 0, 1, 2, 3, 3, 5, 5, 6, 7, 8, 8, 8],
  [0, 1, 2, 3, 3, 5, 5, 6, 7, 8, 8, 8, 8],
  [0, 1, 2, 3, 3, 5, 5, 6, 7, 8, 8, 8],
  [0, 0, 1, 2, 3, 3, 5, 5, 6, 7, 8],
]

/** Each layout's rows: [unshifted, shifted]. The bottom row starts with the ISO key left of Z (a space where there is none). */
const LAYOUT_ROWS: Record<KeyboardLayout, [string, string][]> = {
  qwerty: [
    ['`1234567890-=', '~!@#$%^&*()_+'],
    ['qwertyuiop[]\\', 'QWERTYUIOP{}|'],
    ["asdfghjkl;'", 'ASDFGHJKL:"'],
    [' zxcvbnm,./', ' ZXCVBNM<>?'],
  ],
  dvorak: [
    ['`1234567890[]', '~!@#$%^&*(){}'],
    ["',.pyfgcrl/=\\", '"<>PYFGCRL?+|'],
    ['aoeuidhtns-', 'AOEUIDHTNS_'],
    [' ;qjkxbmwvz', ' :QJKXBMWVZ'],
  ],
  colemak: [
    ['`1234567890-=', '~!@#$%^&*()_+'],
    ['qwfpgjluy;[]\\', 'QWFPGJLUY:{}|'],
    ["arstdhneio'", 'ARSTDHNEIO"'],
    [' zxcvbkm,./', ' ZXCVBKM<>?'],
  ],
  'colemak-dh': [
    ['`1234567890-=', '~!@#$%^&*()_+'],
    ['qwfpbjluy;[]\\', 'QWFPBJLUY:{}|'],
    ["arstgmneio'", 'ARSTGMNEIO"'],
    [' zxcdvkh,./', ' ZXCDVKH<>?'],
  ],
  workman: [
    ['`1234567890-=', '~!@#$%^&*()_+'],
    ['qdrwbjfup;[]\\', 'QDRWBJFUP:{}|'],
    ["ashtgyneoi'", 'ASHTGYNEOI"'],
    [' zxmcvkl,./', ' ZXMCVKL<>?'],
  ],
  qwertz: [
    ['^1234567890ß´', '°!"§$%&/()=?`'],
    ['qwertzuiopü+#', "QWERTZUIOPÜ*'"],
    ['asdfghjklöä', 'ASDFGHJKLÖÄ'],
    ['<yxcvbnm,.-', '>YXCVBNM;:_'],
  ],
  azerty: [
    ['²&é"\'(-è_çà)=', '³1234567890°+'],
    ['azertyuiop^$*', 'AZERTYUIOP¨£µ'],
    ['qsdfghjklmù', 'QSDFGHJKLM%'],
    ['<wxcvbn,;:!', '>WXCVBN?./§'],
  ],
}

function buildMap(layout: KeyboardLayout): Map<string, Finger> {
  const map = new Map<string, Finger>([
    [' ', 'thumb'],
    ['\n', 'right-pinky'],
  ])
  LAYOUT_ROWS[layout].forEach((pair, row) => {
    for (const keys of pair) {
      ;[...keys].forEach((ch, i) => {
        if (ch !== ' ' && !map.has(ch)) map.set(ch, FINGERS[ROW_FINGERS[row][i]])
      })
    }
  })
  return map
}

const MAPS = new Map<KeyboardLayout, Map<string, Finger>>()

/** The finger that types `ch` in standard touch typing on `layout`, or undefined if unknown. */
export function fingerFor(ch: string, layout: KeyboardLayout = 'qwerty'): Finger | undefined {
  let map = MAPS.get(layout)
  if (!map) {
    map = buildMap(layout)
    MAPS.set(layout, map)
  }
  return map.get(ch) ?? map.get(ch.toLowerCase())
}

/**
 * The unshifted characters of a layout, by row: the number row, top, home and
 * bottom rows. A space marks a key the layout does not have (the ISO key left
 * of Z on US-style layouts).
 */
export function layoutRows(layout: KeyboardLayout): string[] {
  return LAYOUT_ROWS[layout].map(([plain]) => plain)
}
