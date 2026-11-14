import {useMemo} from 'react'
import type {Category,Quadrant,Todo,TodoList} from '../../../core/types'
import type {TodoGroupBy,TodoScope,TodoSection} from '../types'
import {ORPHAN_CATEGORY_KEY,ORPHAN_LIST_KEY,QUADRANT_META,UNCATEGORIZED_KEY} from '../types'

/**
 * 视图选择器（纯函数层）：
 * 所有视图共用同一份 filter → sort 结果，分组由各视图自行决定。
 * 这里不访问 React、不读写 localStorage、不碰云端，便于单测。
 */

/**
 * 日期 + 清单筛选。
 * scope='date' 严格只留 due_date === date（规格 §4.8，无日期任务不再每天可见）；
 * scope='unscheduled' 只留 due_date 为空的未排期任务。
 */
export function filterTodos(todos: Todo[], date: string, activeList: string, scope: TodoScope = 'date'): Todo[] {
  return todos.filter(todo => {
    if (activeList !== 'all' && todo.list_id !== activeList) return false
    if (scope === 'unscheduled') return !todo.due_date
    return todo.due_date === date
  })
}

/** 稳定排序：未完成优先 → 置顶 → 时间升序（无时间排后）→ 原顺序 */
export function sortTodos(todos: Todo[]): Todo[] {
  return todos
    .map((todo, index) => ({todo, index}))
    .sort((a, b) => {
      const completed = (a.todo.completed ? 1 : 0) - (b.todo.completed ? 1 : 0)
      if (completed) return completed
      const pinned = (b.todo.pinned ? 1 : 0) - (a.todo.pinned ? 1 : 0)
      if (pinned) return pinned
      const timeA = a.todo.due_time || '99:99'
      const timeB = b.todo.due_time || '99:99'
      if (timeA !== timeB) return timeA < timeB ? -1 : 1
      return a.index - b.index
    })
    .map(entry => entry.todo)
}

/** 看板：固定输出 q1–q4 四列（空列也保留，保证落卡位置稳定） */
export function buildQuadrantColumns(items: Todo[]): {id: Quadrant; items: Todo[]}[] {
  return QUADRANT_META.map(meta => ({
    id: meta.id,
    items: items.filter(todo => todo.quadrant === meta.id),
  }))
}

const padTime = (text: string): string => {
  const [hour, minute] = text.split(':')
  if (hour === undefined || minute === undefined) return text
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

/** 从 HH:mm 或 ISO 字符串中取 HH:mm，取不到返回空串 */
export function timeOfValue(value?: string): string {
  if (!value) return ''
  const matched = /(\d{1,2}:\d{2})/.exec(value)
  return matched ? padTime(matched[1]) : ''
}

/** 时间线取时：start 优先，其次 due_time，最后 end */
export function timelineTimeOf(todo: Todo): string {
  return timeOfValue(todo.start) || timeOfValue(todo.due_time) || timeOfValue(todo.end)
}

/** 时间线：只收有具体时间的待办（规格 §4.11），按时间升序、同时刻保持原顺序 */
export function buildTimeline(items: Todo[]): Todo[] {
  return items
    .map((todo, index) => ({todo, index, time: timelineTimeOf(todo)}))
    .filter(entry => entry.time !== '')
    .sort((a, b) => {
      if (a.time !== b.time) return a.time < b.time ? -1 : 1
      return a.index - b.index
    })
    .map(entry => entry.todo)
}

const bucketOf = (items: Todo[], keyOf: (todo: Todo) => string) => {
  const buckets = new Map<string, Todo[]>()
  items.forEach(todo => {
    const key = keyOf(todo)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(todo)
    else buckets.set(key, [todo])
  })
  return buckets
}

/** 分组：key 统一带维度前缀，折叠状态因此可以按 `groupBy + groupKey` 精确记忆 */
export function buildSections(
  items: Todo[],
  groupBy: TodoGroupBy,
  lists: TodoList[],
  categories: Category[],
): TodoSection[] {
  if (groupBy === 'none') {
    return [{key: 'none:all', label: '全部', count: items.length, items}]
  }

  if (groupBy === 'status') {
    const undone = items.filter(todo => !todo.completed)
    const done = items.filter(todo => todo.completed)
    return [
      {key: 'status:undone', label: '未完成', count: undone.length, items: undone},
      {key: 'status:done', label: '已完成', count: done.length, items: done},
    ]
  }

  if (groupBy === 'list') {
    const known = new Set(lists.map(list => list.id))
    const buckets = bucketOf(items, todo => (known.has(todo.list_id) ? todo.list_id : ORPHAN_LIST_KEY))
    const sections: TodoSection[] = lists
      .filter(list => (buckets.get(list.id)?.length || 0) > 0)
      .map(list => ({
        key: `list:${list.id}`,
        label: `${list.icon || '📁'} ${list.name}`.trim(),
        count: buckets.get(list.id)!.length,
        items: buckets.get(list.id)!,
      }))
    const orphans = buckets.get(ORPHAN_LIST_KEY) || []
    if (orphans.length > 0) {
      sections.push({key: `list:${ORPHAN_LIST_KEY}`, label: '未归类（清单已删除）', count: orphans.length, items: orphans, orphan: true})
    }
    return sections
  }

  const known = new Set(categories.map(category => category.id))
  const buckets = bucketOf(items, todo => {
    const id = todo.category_id || ''
    if (!id) return UNCATEGORIZED_KEY
    return known.has(id) ? id : ORPHAN_CATEGORY_KEY
  })
  const sections: TodoSection[] = categories
    .filter(category => (buckets.get(category.id)?.length || 0) > 0)
    .map(category => ({
      key: `category:${category.id}`,
      label: category.name,
      count: buckets.get(category.id)!.length,
      items: buckets.get(category.id)!,
    }))
  const uncategorized = buckets.get(UNCATEGORIZED_KEY) || []
  if (uncategorized.length > 0) {
    sections.push({key: `category:${UNCATEGORIZED_KEY}`, label: '未分类', count: uncategorized.length, items: uncategorized})
  }
  const orphans = buckets.get(ORPHAN_CATEGORY_KEY) || []
  if (orphans.length > 0) {
    sections.push({key: `category:${ORPHAN_CATEGORY_KEY}`, label: '未归类（分类已删除）', count: orphans.length, items: orphans, orphan: true})
  }
  return sections
}

export function useTodosViewData(params: {
  todos: Todo[]
  lists: TodoList[]
  categories: Category[]
  date: string
  activeList: string
  scope: TodoScope
  groupBy: TodoGroupBy
}) {
  const {todos, lists, categories, date, activeList, scope, groupBy} = params
  return useMemo(() => {
    const items = sortTodos(filterTodos(todos, date, activeList, scope))
    const undone = items.filter(todo => !todo.completed).length
    return {
      items,
      sections: buildSections(items, groupBy, lists, categories),
      counts: {visible: items.length, undone, done: items.length - undone},
    }
  }, [todos, lists, categories, date, activeList, scope, groupBy])
}
