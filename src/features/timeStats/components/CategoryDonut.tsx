import { useState } from 'react'
import type { Category } from '../../../core/types'
import { colorForCategory, OTHER_CATEGORY_COLOR } from '../../../core/categoryColor'
import type { AggregatedCategory } from '../model/categoryAgg'
import { buildDonutSectors } from '../model/sectorGeometry'

const SIZE = 240
const CX = 120
const CY = 120
const R_OUTER = 96
const R_INNER = 62

export interface CategoryDonutProps {
  items: AggregatedCategory[]
  totalHours: number
  recordCount: number
  categories: Category[]
  selected: string | null
  onSelect: (category: string | null) => void
  granularityLabel: string
}

export default function CategoryDonut({
  items,
  totalHours,
  recordCount,
  categories,
  selected,
  onSelect,
  granularityLabel,
}: CategoryDonutProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const specs = items.map(item => {
    const color = item.isOther ? OTHER_CATEGORY_COLOR : colorForCategory(item.category, categories)
    return { key: item.category, label: item.category, value: item.hours, color }
  })

  const sectors = buildDonutSectors(specs, {
    cx: CX,
    cy: CY,
    rOuter: R_OUTER,
    rInner: R_INNER,
    gapDeg: 2,
  })

  const hoveredSector = sectors.find(sector => sector.key === hovered) ?? null
  const fullCircle = sectors.length === 1 && sectors[0].fullCircle

  const handleSelect = (category: string, isOther: boolean) => {
    if (isOther) return
    onSelect(selected === category ? null : category)
  }

  const centerLabel = hoveredSector
    ? hoveredSector.label
    : selected
      ? selected
      : granularityLabel
  const centerValue = hoveredSector
    ? `${hoveredSector.value.toFixed(1)}h`
    : `${totalHours.toFixed(1)}h`
  const centerSub = hoveredSector
    ? `${(hoveredSector.share * 100).toFixed(0)}%`
    : `${recordCount} 条记录`

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="ts-donut"
      role="img"
      aria-label={`${granularityLabel}分类占比，共 ${totalHours.toFixed(1)} 小时`}
    >
      <circle
        cx={CX}
        cy={CY}
        r={(R_OUTER + R_INNER) / 2}
        fill="none"
        stroke="var(--ts-surface)"
        strokeWidth={R_OUTER - R_INNER}
      />

      {sectors.map(sector => {
        const isOther = sector.key === '其他'
        const dimmed =
          (selected !== null && selected !== sector.key) ||
          (hovered !== null && hovered !== sector.key)
        if (sector.fullCircle) {
          return (
            <circle
              key={sector.key}
              cx={CX}
              cy={CY}
              r={(R_OUTER + R_INNER) / 2}
              fill="none"
              stroke={sector.color}
              strokeWidth={R_OUTER - R_INNER}
              opacity={dimmed ? 0.35 : 1}
            >
              <title>{`${sector.label} · ${sector.value.toFixed(1)}h`}</title>
            </circle>
          )
        }
        const rad = ((sector.midDeg - 90) * Math.PI) / 180
        const lift = hovered === sector.key ? 4 : selected === sector.key ? 3 : 0
        return (
          <path
            key={sector.key}
            d={sector.path}
            fill={sector.color}
            stroke="var(--ts-card-stroke)"
            strokeWidth={1.5}
            opacity={dimmed ? 0.35 : 1}
            transform={lift ? `translate(${Math.cos(rad) * lift} ${Math.sin(rad) * lift})` : undefined}
            className={isOther ? 'ts-sector is-static' : 'ts-sector'}
            tabIndex={isOther ? -1 : 0}
            role={isOther ? undefined : 'button'}
            aria-label={`${sector.label} ${sector.value.toFixed(1)} 小时，占 ${(sector.share * 100).toFixed(0)}%`}
            onPointerEnter={() => setHovered(sector.key)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(sector.key)}
            onBlur={() => setHovered(null)}
            onClick={() => handleSelect(sector.key, isOther)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleSelect(sector.key, isOther)
              }
            }}
          >
            <title>{`${sector.label} · ${sector.value.toFixed(1)}h · ${(sector.share * 100).toFixed(0)}%`}</title>
          </path>
        )
      })}

      <text x={CX} y={CY - 12} textAnchor="middle" className="ts-donut-label">
        {centerLabel}
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" className="ts-donut-total">
        {centerValue}
      </text>
      <text x={CX} y={CY + 36} textAnchor="middle" className="ts-donut-sub">
        {centerSub}
      </text>
    </svg>
  )
}
