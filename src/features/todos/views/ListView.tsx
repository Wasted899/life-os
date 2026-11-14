import {useMemo} from 'react'
import TodoGroup from '../components/TodoGroup'
import TodoRow from '../components/TodoRow'
import type {TodoViewProps} from '../types'

/** 列表视图：只消费 sections + 事件，是后续看板/时间线复用的第一实现 */
export default function ListView({
  sections,
  batchMode,
  selected,
  collapsed,
  lists,
  categories,
  onToggleCollapse,
  onToggleGroupSelect,
  onToggleSelect,
  onToggleComplete,
  onTogglePin,
  onDelete,
}: TodoViewProps) {
  const listNames = useMemo(() => new Map(lists.map(list => [list.id, list.name])), [lists])
  const categoryNames = useMemo(() => new Map(categories.map(category => [category.id, category.name])), [categories])

  if (sections.every(section => section.count === 0)) {
    return <div className="empty">这一天没有待办</div>
  }

  return (
    <>
      {sections.map(section => (
        <TodoGroup
          key={section.key}
          section={section}
          batchMode={batchMode}
          selected={selected}
          collapsed={!!collapsed[section.key]}
          onToggleCollapse={onToggleCollapse}
          onToggleGroupSelect={onToggleGroupSelect}
        >
          {section.items.map(todo => (
            <TodoRow
              key={todo.id}
              todo={todo}
              batchMode={batchMode}
              selected={selected.has(todo.id)}
              listName={listNames.get(todo.list_id)}
              categoryName={todo.category_id ? categoryNames.get(todo.category_id) : undefined}
              onToggleSelect={onToggleSelect}
              onToggleComplete={onToggleComplete}
              onTogglePin={onTogglePin}
              onDelete={onDelete}
            />
          ))}
        </TodoGroup>
      ))}
    </>
  )
}
