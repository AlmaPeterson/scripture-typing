// "Your best layout" on the Stats screen. Pure functions, no React.
//
// A letter pair's speed belongs to the two keys it is typed on, not to the
// letters: typing "th" fast on QWERTY means moving from the T key to the H key
// is fast for you. So the user's letter and pair stats are turned into times
// for each key and each pair of keys of their current layout. Then the 26
// letters are shuffled between the 26 keys that hold letters now (punctuation
// stays put), looking for the arrangement that types the user's courses in
// the least time, counting each letter pair inside words and each letter
// starting a word.

import type { KeyStat } from '../storage'
import { layoutRows, type KeyboardLayout } from '../typing'

export const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const N = 26

/** Pair stats are blended with an estimate as if this many samples of it had been typed. */
const PRIOR_SAMPLES = 5
/** A key pair counts as measured with at least this many timed samples. */
const MEASURED_SAMPLES = 3
/** Letters needing at least this many timed samples before a result is shown. */
const READY_SAMPLES = 5
/** How many letters need READY_SAMPLES before a result is shown. */
const READY_LETTERS = 20

export interface TextCounts {
  /** pairs[a * 26 + b]: how often letter b follows letter a inside a word. */
  pairs: Float64Array
  /** starts[a]: how often a word starts with letter a. */
  starts: Float64Array
  letters: number
}

export function emptyCounts(): TextCounts {
  return { pairs: new Float64Array(N * N), starts: new Float64Array(N), letters: 0 }
}

function letterIndex(ch: string): number {
  const c = ch.toLowerCase()
  return ch.length === 1 && c >= 'a' && c <= 'z' ? c.charCodeAt(0) - 97 : -1
}

/** Add a text's letters and in-word letter pairs (case ignored) to `counts`. */
export function addText(counts: TextCounts, text: string) {
  let prev = -1
  for (const ch of text) {
    const i = letterIndex(ch)
    if (i < 0) {
      prev = -1
      continue
    }
    counts.letters++
    if (prev < 0) counts.starts[i]++
    else counts.pairs[prev * N + i]++
    prev = i
  }
}

/**
 * The user's times on their current layout. Keys are numbered by the letter
 * on them now (key 0 holds "a"), so key pair (i, j) was measured by typing
 * the letter pair LETTERS[i] + LETTERS[j].
 */
export interface KeyTimes {
  /** Average ms to reach each key from the key before it. */
  key: Float64Array
  /** pair[i * 26 + j]: ms to type key j right after key i. */
  pair: Float64Array
  /** Whether each key pair has enough samples of its own. */
  measured: Uint8Array
  /** Letters with enough samples for a result. */
  readyLetters: number
}

export function keyTimes(stats: KeyStat[]): KeyTimes {
  const letters = new Map<string, KeyStat>()
  const bigrams = new Map<string, KeyStat>()
  for (const s of stats) {
    if (s.kind === 'letter') letters.set(s.key, s)
    else if (s.kind === 'bigram') bigrams.set(s.key, s)
  }
  let sumMs = 0
  let sumCount = 0
  for (const s of letters.values()) {
    sumMs += s.totalMs
    sumCount += s.timedCount
  }
  const mean = sumCount > 0 ? sumMs / sumCount : 250

  const key = new Float64Array(N)
  let readyLetters = 0
  for (let i = 0; i < N; i++) {
    const s = letters.get(LETTERS[i])
    const timed = s?.timedCount ?? 0
    if (timed >= READY_SAMPLES) readyLetters++
    key[i] = ((s?.totalMs ?? 0) + PRIOR_SAMPLES * mean) / (timed + PRIOR_SAMPLES)
  }

  const pair = new Float64Array(N * N)
  const measured = new Uint8Array(N * N)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const s = bigrams.get(LETTERS[i] + LETTERS[j])
      const timed = s?.timedCount ?? 0
      // With few samples, lean on how fast the second key is on its own.
      pair[i * N + j] = ((s?.totalMs ?? 0) + PRIOR_SAMPLES * key[j]) / (timed + PRIOR_SAMPLES)
      measured[i * N + j] = timed >= MEASURED_SAMPLES ? 1 : 0
    }
  }
  return { key, pair, measured, readyLetters }
}

export function isReady(times: KeyTimes): boolean {
  return times.readyLetters >= READY_LETTERS
}

/** Predicted ms to type the letters of `counts` with letter a on key keyOf[a]. */
export function layoutCost(counts: TextCounts, times: KeyTimes, keyOf: ArrayLike<number>): number {
  let ms = 0
  for (let a = 0; a < N; a++) {
    ms += counts.starts[a] * times.key[keyOf[a]]
    for (let b = 0; b < N; b++) {
      const n = counts.pairs[a * N + b]
      if (n) ms += n * times.pair[keyOf[a] * N + keyOf[b]]
    }
  }
  return ms
}

/** Share (0..1) of the text's letter pairs that land on key pairs with measured times. */
export function measuredShare(
  counts: TextCounts,
  times: KeyTimes,
  keyOf: ArrayLike<number>,
): number {
  let all = 0
  let measured = 0
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      const n = counts.pairs[a * N + b]
      all += n
      if (times.measured[keyOf[a] * N + keyOf[b]]) measured += n
    }
  }
  return all > 0 ? measured / all : 0
}

/** Small seeded random generator (mulberry32), so a result does not change between runs. */
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The cost of every term that involves letter x or letter y. */
function partCost(
  counts: TextCounts,
  times: KeyTimes,
  keyOf: Int32Array,
  x: number,
  y: number,
): number {
  const { pairs, starts } = counts
  const { pair, key } = times
  const kx = keyOf[x]
  const ky = keyOf[y]
  let ms = starts[x] * key[kx] + starts[y] * key[ky]
  for (let c = 0; c < N; c++) {
    const kc = keyOf[c]
    ms += pairs[x * N + c] * pair[kx * N + kc] + pairs[y * N + c] * pair[ky * N + kc]
    if (c !== x && c !== y) {
      ms += pairs[c * N + x] * pair[kc * N + kx] + pairs[c * N + y] * pair[kc * N + ky]
    }
  }
  return ms
}

function swapDelta(counts: TextCounts, times: KeyTimes, keyOf: Int32Array, x: number, y: number) {
  const before = partCost(counts, times, keyOf, x, y)
  ;[keyOf[x], keyOf[y]] = [keyOf[y], keyOf[x]]
  const after = partCost(counts, times, keyOf, x, y)
  ;[keyOf[x], keyOf[y]] = [keyOf[y], keyOf[x]]
  return after - before
}

/**
 * The arrangement with the lowest predicted time: keyOf[a] is the key letter a
 * goes on. Simulated annealing from several starts, then swaps until no swap
 * of two letters helps.
 */
export function optimize(
  counts: TextCounts,
  times: KeyTimes,
  { restarts = 6, steps = 40000, seed = 1 } = {},
): Int32Array {
  const rand = random(seed)
  const identity = Int32Array.from({ length: N }, (_, i) => i)
  let best = identity.slice()
  let bestCost = layoutCost(counts, times, best)

  for (let r = 0; r < restarts; r++) {
    const keyOf = identity.slice()
    // The first run starts from the current layout, the others from a shuffle.
    if (r > 0) {
      for (let i = N - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[keyOf[i], keyOf[j]] = [keyOf[j], keyOf[i]]
      }
    }
    let cost = layoutCost(counts, times, keyOf)
    // Start hot enough to accept a typical bad swap often.
    let typical = 0
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(rand() * N)
      const y = (x + 1 + Math.floor(rand() * (N - 1))) % N
      typical += Math.abs(swapDelta(counts, times, keyOf, x, y))
    }
    const t0 = typical / 100 || 1
    const t1 = t0 / 1000
    for (let step = 0; step < steps; step++) {
      const temp = t0 * (t1 / t0) ** (step / steps)
      const x = Math.floor(rand() * N)
      const y = (x + 1 + Math.floor(rand() * (N - 1))) % N
      const d = swapDelta(counts, times, keyOf, x, y)
      if (d < 0 || rand() < Math.exp(-d / temp)) {
        ;[keyOf[x], keyOf[y]] = [keyOf[y], keyOf[x]]
        cost += d
      }
    }
    // Finish with every swap that still helps.
    for (let improved = true; improved;) {
      improved = false
      for (let x = 0; x < N; x++) {
        for (let y = x + 1; y < N; y++) {
          const d = swapDelta(counts, times, keyOf, x, y)
          if (d < -1e-9) {
            ;[keyOf[x], keyOf[y]] = [keyOf[y], keyOf[x]]
            cost += d
            improved = true
          }
        }
      }
    }
    if (cost < bestCost - 1e-9) {
      best = keyOf
      bestCost = cost
    }
  }
  return best
}

export interface LayoutResult {
  /** letterOn[k]: the letter put on key k (key k holds LETTERS[k] now). */
  letterOn: string[]
  currentMs: number
  bestMs: number
  letters: number
  /** Share of letter pairs with measured times, on the current and best layouts. */
  measured: { current: number; best: number }
}

export function bestLayout(counts: TextCounts, times: KeyTimes): LayoutResult {
  const identity = Int32Array.from({ length: N }, (_, i) => i)
  const keyOf = optimize(counts, times)
  const letterOn = new Array<string>(N)
  for (let a = 0; a < N; a++) letterOn[keyOf[a]] = LETTERS[a]
  return {
    letterOn,
    currentMs: layoutCost(counts, times, identity),
    bestMs: layoutCost(counts, times, keyOf),
    letters: counts.letters,
    measured: {
      current: measuredShare(counts, times, identity),
      best: measuredShare(counts, times, keyOf),
    },
  }
}

export interface KeyCap {
  /** What the key types on the user's layout now. */
  current: string
  /** Index of the letter key (into LETTERS, by its current letter), or -1 for punctuation. */
  letterKey: number
}

/** The top, home and bottom rows of a layout, for drawing it. */
export function keyboardRows(layout: KeyboardLayout): KeyCap[][] {
  return layoutRows(layout)
    .slice(1)
    .map((row) =>
      [...row]
        .filter((ch) => ch !== ' ')
        .map((ch) => ({ current: ch, letterKey: letterIndex(ch) })),
    )
}
