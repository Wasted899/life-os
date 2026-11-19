import type { Category } from '../../../core/types'
import { colorForCategory, OTHER_CATEGORY_COLOR } from '../../../core/categoryColor'
import type { AggregatedCategory } from '../model/categoryAgg'

interface Props {
  items: AggregatedCategory[]
  categories: Category[]
  selected: string | null
  onSelect: (category: string | null) => void
}

export default function CategoryLegend({ items, categories, selected, onSelect }: Props) {
  if (items.length === 0) return null

  return (
    <div className="ts-legend">
      {items.map(item => {
        const color = item.isOther ? OTHER_CATEGORY_COLOR : colorForCategory(item.category, categories)
        const isSelected = selected === item.category
        const className = [
          'ts-legend-row',
          isSelected ? 'is-selected' : '',
          item.isOther ? 'is-static' : '',
        ].filter(Boolean).join(' ')

        return (
          <button
            key={item.category}
            type="button"
            className={className}
            disabled={item.isOther}
            onClick={() => onSelect(isSelected ? null : item.category)}
            title={item.isOther ? '多个次要分类的合并项' : `只看「${item.category}」`}
          >
            <span className="ts-legend-dot" style={{ background: color }} />
            <span className="ts-legend-name">{item.category}</span>
            <span className="ts-legend-bar">
              <span style={{ width: `${Math.max(2, item.share * 100)}%`, background: color }} />
            </span>
            <span className="ts-legend-hours">{item.hours.toFixed(1)}h</span>
            <span className="ts-legend-share">{(item.share * 100).toFixed(0)}%</span>
          </button>
        )
      })}
    </div>
  )
}
