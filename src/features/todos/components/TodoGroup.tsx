import type {ReactNode} from 'react'
import type {Todo} from '../../../core/types'
import type {TodoSection} from '../types'

type Props = {
  section: TodoSection
  batchMode: boolean
  selected: Set<string>
  collapsed: boolean
  onToggleCollapse: (key: string) => void
  onToggleGroupSelect: (items: Todo[], checked: boolean) => void
  children: ReactNode
}

/** 分组头：折叠 + 组内计数 + 批量三态全选（只作用于本组可见项） */
export default function TodoGroup({
  section,
  batchMode,
  selected,
  collapsed,
  onToggleCollapse,
  onToggleGroupSelect,
  children,
}: Props) {
  const selectedInGroup = section.items.filter(todo => selected.has(todo.id)).length
  const allSelected = section.count > 0 && selectedInGroup === section.count
  const someSelected = selectedInGroup > 0 && !allSelected

  return (
    <div>
      <div className="collapse-header" onClick={() => onToggleCollapse(section.key)}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {batchMode && (
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => {
                if (el) el.indeterminate = someSelected
              }}
              onClick={e => e.stopPropagation()}
              onChange={e => onToggleGroupSelect(section.items, e.target.checked)}
              aria-label={`全选 ${section.label}`}
            />
          )}
          <span style={{color:section.orphan ? '#b45309' : undefined}}>{section.label} ({section.count})</span>
        </div>
        <span className={`collapse-arrow ${collapsed ? 'collapsed' : ''}`}>▼</span>
      </div>
      {!collapsed && children}
    </div>
  )
}
