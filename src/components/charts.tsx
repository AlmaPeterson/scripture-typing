// Lightweight SVG charts (no chart library). One series per chart, never two
// y-axes. Every point has a native tooltip; callers also offer a table view.

export interface Point {
  /** x label, e.g. a date */
  label: string
  value: number
}

interface LineChartProps {
  points: Point[]
  title: string
  format: (v: number) => string
  /** Lowest y value shown (default: 0). */
  min?: number
  max?: number
  height?: number
}

const W = 640
const PAD = { top: 12, right: 12, bottom: 24, left: 44 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

export function LineChart({ points, title, format, min = 0, max, height = 180 }: LineChartProps) {
  if (points.length === 0) return <p className="muted">No data yet.</p>
  const top = max ?? niceMax(Math.max(...points.map((p) => p.value)))
  const lo = Math.min(min, ...points.map((p) => p.value))
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (top - lo || 1)) * innerH
  const ticks = [0, 0.5, 1].map((f) => lo + f * (top - lo))
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      <path className="line-1" d={d.join(' ')} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          {/* Larger invisible hit target with the tooltip. */}
          <circle cx={x(i)} cy={y(p.value)} r={9} fill="transparent">
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </circle>
          <circle className="dot-1" cx={x(i)} cy={y(p.value)} r={points.length > 40 ? 2 : 3.5} />
          {(i % labelEvery === 0 || i === points.length - 1) && (
            <text x={x(i)} y={height - 6} textAnchor="middle">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export function BarChart({
  points,
  title,
  format,
  height = 140,
}: {
  points: Point[]
  title: string
  format: (v: number) => string
  height?: number
}) {
  if (points.length === 0) return <p className="muted">No data yet.</p>
  const top = niceMax(Math.max(...points.map((p) => p.value)))
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const slot = innerW / points.length
  const bw = Math.max(2, Math.min(28, slot - 2))
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {[0, top].map((t) => (
        <g key={t}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = PAD.left + slot * i + slot / 2
        const h = Math.max(0, y(0) - y(p.value))
        return (
          <g key={i}>
            <rect
              className="bar-mark"
              x={cx - bw / 2}
              y={y(p.value)}
              width={bw}
              height={h}
              rx={Math.min(4, bw / 2)}
            />
            <rect
              x={PAD.left + slot * i}
              y={PAD.top}
              width={slot}
              height={innerH}
              fill="transparent"
            >
              <title>{`${p.label}: ${format(p.value)}`}</title>
            </rect>
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={cx} y={height - 6} textAnchor="middle">
                {p.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Horizontal bars with labels and values: for letters, words, fingers. */
export function BarList({
  items,
  format,
  max,
}: {
  items: { key: string; label: string; value: number; note?: string }[]
  format: (v: number) => string
  max?: number
}) {
  if (items.length === 0) return <p className="muted">Not enough data yet.</p>
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.key} title={item.note}>
          <span className="key-label">{item.label}</span>
          <span className="bar-track" aria-hidden="true">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(2, (item.value / top) * 100)}%`, display: 'block' }}
            />
          </span>
          <span className="bar-value">{format(item.value)}</span>
        </li>
      ))}
    </ul>
  )
}
