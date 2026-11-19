import dayjs from 'dayjs'
import type { Category, TimeBlock } from '../../../core/types'
import { colorForCategory } from '../../../core/categoryColor'
import { classifyTimeBlock } from '../../../core/timeRange'
import { donutArcPath, polarPoint } from '../model/sectorGeometry'

const SIZE = 320
const CX = 160
const CY = 160
const R_OUTER = 124
const R_INNER = 84

interface Props {
  blocks: TimeBlock[]
  date: string
  totalHours: number
  categories: Category[]
}

/** 日视图副图：24 小时时间分布轮盘（异常块不参与环，避免超过 360°） */
export default function DayClockWheel({ blocks, date, totalHours, categories }: Props) {
  const segments = blocks
    .filter(block => block.date === date)
    .map(block => ({ block, diagnosis: classifyTimeBlock(block) }))
    .filter(item => !item.diagnosis.range.abnormal && item.diagnosis.usableSpan > 0)
    .map(item => {
      const startDeg = (item.diagnosis.range.start / 24) * 360
      const endDeg = (item.diagnosis.range.end / 24) * 360
      const gap = Math.min(0.8, (endDeg - startDeg) * 0.15)
      return {
        block: item.block,
        path: donutArcPath(CX, CY, R_OUTER, R_INNER, startDeg + gap / 2, endDeg - gap / 2),
        color: colorForCategory(item.block.category, categories),
        label: `${item.block.title} ${item.diagnosis.range.start}:00–${item.diagnosis.range.end}:00`,
      }
    })

  const today = dayjs().format('YYYY-MM-DD')
  const nowHours = dayjs().hour() + dayjs().minute() / 60
  const nowDeg = (nowHours / 24) * 360
  const isToday = date === today

  const ticks = Array.from({ length: 24 }, (_, hour) => {
    const deg = (hour / 24) * 360
    const inner = polarPoint(CX, CY, R_OUTER + 8, deg)
    const outer = polarPoint(CX, CY, R_OUTER + 14, deg)
    const labelPoint = polarPoint(CX, CY, R_OUTER + 26, deg)
    return (
      <g key={hour}>
        <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className={hour % 6 === 0 ? 'ts-tick is-major' : 'ts-tick'} />
        {hour % 3 === 0 && (
          <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle" dominantBaseline="middle" className="ts-tick-label">
            {hour}
          </text>
        )}
      </g>
    )
  })

  return (
    <div className="ts-clock-wrap">
      <div className="ts-subtitle">24 小时时间分布</div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ts-clock" role="img" aria-label="24 小时时间分布">
        {ticks}
        <circle cx={CX} cy={CY} r={(R_OUTER + R_INNER) / 2} fill="none" stroke="var(--ts-surface)" strokeWidth={R_OUTER - R_INNER} />
        {segments.map(segment => (
          <path
            key={segment.block.id}
            d={segment.path}
            fill={segment.color}
            stroke="var(--ts-card-stroke)"
            strokeWidth={1.2}
            opacity={0.88}
          >
            <title>{segment.label}</title>
          </path>
        ))}
        {isToday && (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={polarPoint(CX, CY, R_OUTER, nowDeg).x}
              y2={polarPoint(CX, CY, R_OUTER, nowDeg).y}
              className="ts-now-hand"
            />
            <circle cx={CX} cy={CY} r={4} className="ts-now-dot" />
          </>
        )}
        <text x={CX} y={CY - 6} textAnchor="middle" className="ts-clock-total">{totalHours.toFixed(1)}h</text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="ts-clock-sub">
          已记录 {Math.min(100, (totalHours / 24) * 100).toFixed(0)}%
        </text>
      </svg>
    </div>
  )
}
