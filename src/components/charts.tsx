// Lightweight SVG charts (no chart library). One series per chart, never two
// y-axes. Hovering a point shows its details; callers also offer a table view.

import { useState, type MouseEvent, type ReactNode } from 'react'

export interface Detail {
  label: string
  value: string
}

export interface Point {
  /** x label, e.g. a date */
  label: string
  value: number
  /** More about the point, shown when it is hovered. */
  details?: Detail[]
}

/** Handlers that set the point under the pointer, from its x position in the chart. */
function hoverHandlers(
  count: number,
  indexAt: (x: number) => number,
  setHover: (i: number | null) => void,
) {
  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const x = ((e.clientX - rect.left) / rect.width) * W
    const i = indexAt(x)
    setHover(Math.max(0, Math.min(count - 1, i)))
  }
  return { onMouseMove, onMouseLeave: () => setHover(null) }
}

/** The details box over a chart; `x` and `y` are in chart (viewBox) units. */
function Tooltip({
  x,
  y,
  height,
  point,
  value,
}: {
  x: number
  y: number
  height: number
  point: Point
  value: string
}) {
  // Keep the box inside the chart near its edges.
  const align = x < W * 0.2 ? 'start' : x > W * 0.8 ? 'end' : 'middle'
  return (
    <div
      className={`chart-tip chart-tip-${align}`}
      style={{ left: `${(x / W) * 100}%`, top: `${(y / height) * 100}%` }}
      aria-hidden="true"
    >
      <div className="chart-tip-title">{point.label}</div>
      <div className="chart-tip-value">{value}</div>
      {point.details && <DetailList details={point.details} />}
    </div>
  )
}

function DetailList({ details }: { details: Detail[] }) {
  return (
    <dl className="tip-details">
      {details.map((d) => (
        <div key={d.label}>
          <dt>{d.label}</dt>
          <dd>{d.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ChartFrame({ children, tip }: { children: ReactNode; tip: ReactNode }) {
  return (
    <div className="chart-frame">
      {children}
      {tip}
    </div>
  )
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
  const [hover, setHover] = useState<number | null>(null)
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
  const { onMouseMove, onMouseLeave } = hoverHandlers(
    points.length,
    (px) =>
      points.length === 1 ? 0 : Math.round(((px - PAD.left) / innerW) * (points.length - 1)),
    setHover,
  )
  const hp = hover === null ? null : points[hover]

  return (
    <ChartFrame
      tip={
        hp &&
        hover !== null && (
          <Tooltip
            x={x(hover)}
            y={y(hp.value)}
            height={height}
            point={hp}
            value={format(hp.value)}
          />
        )
      }
    >
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={title}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {/* Catches the pointer over the whole plot area. */}
        <rect x={0} y={0} width={W} height={height} fill="transparent" />
        {hover !== null && (
          <line
            className="hover-line"
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
          />
        )}
        <path className="line-1" d={d.join(' ')} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              className="dot-1"
              cx={x(i)}
              cy={y(p.value)}
              r={i === hover ? 5 : points.length > 40 ? 2 : 3.5}
            />
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={x(i)} y={height - 6} textAnchor="middle">
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </ChartFrame>
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
  const [hover, setHover] = useState<number | null>(null)
  if (points.length === 0) return <p className="muted">No data yet.</p>
  const top = niceMax(Math.max(...points.map((p) => p.value)))
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const slot = innerW / points.length
  const bw = Math.max(2, Math.min(28, slot - 2))
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const { onMouseMove, onMouseLeave } = hoverHandlers(
    points.length,
    (px) => Math.floor((px - PAD.left) / slot),
    setHover,
  )
  const hp = hover === null ? null : points[hover]
  return (
    <ChartFrame
      tip={
        hp &&
        hover !== null && (
          <Tooltip
            x={PAD.left + slot * hover + slot / 2}
            y={y(hp.value)}
            height={height}
            point={hp}
            value={format(hp.value)}
          />
        )
      }
    >
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={title}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <rect x={0} y={0} width={W} height={height} fill="transparent" />
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
              {i === hover && (
                <rect
                  className="hover-band"
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                />
              )}
              <rect
                className="bar-mark"
                x={cx - bw / 2}
                y={y(p.value)}
                width={bw}
                height={h}
                rx={Math.min(4, bw / 2)}
              />
              {(i % labelEvery === 0 || i === points.length - 1) && (
                <text x={cx} y={height - 6} textAnchor="middle">
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </ChartFrame>
  )
}

/** Horizontal bars with labels and values: for letters, words, fingers. */
export function BarList({
  items,
  format,
  max,
  mono = true,
}: {
  items: { key: string; label: string; value: number; details?: Detail[] }[]
  format: (v: number) => string
  max?: number
  /** Show labels in the monospace key font. */
  mono?: boolean
}) {
  if (items.length === 0) return <p className="muted">Not enough data yet.</p>
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="bars">
      {items.map((item) => (
        // Focusable so the details can be read from the keyboard too.
        <li key={item.key} tabIndex={item.details ? 0 : undefined}>
          <span className={mono ? 'key-label' : undefined}>{item.label}</span>
          <span className="bar-track" aria-hidden="true">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(2, (item.value / top) * 100)}%`, display: 'block' }}
            />
          </span>
          <span className="bar-value">{format(item.value)}</span>
          {item.details && (
            <div className="bar-tip" role="tooltip">
              <div className="chart-tip-title">{item.label}</div>
              <div className="chart-tip-value">{format(item.value)}</div>
              <DetailList details={item.details} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
