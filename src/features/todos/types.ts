import type {Category,Todo,TodoList} from '../../core/types'

/** 视图模式：列表 / 看板（按 quadrant）/ 时间线（只收有具体时间的待办） */
export type TodoViewMode = 'list' | 'board' | 'timeline'

/** 数据范围：按选中日期严格过滤 / 只看未排期（due_date 为空） */
export type TodoScope = 'date' | 'unscheduled'

/** 分组维度：状态 / 清单 / 分类 / 不分组 */
export type TodoGroupBy = 'status' | 'list' | 'category' | 'none'

export interface TodoSection {
  /** 复合 key：`${groupBy}:${rawKey}`，折叠状态按它持久化 */
  key: string
  label: string
  count: number
  items: Todo[]
  /** 引用已失效（清单/分类在别处被删），仅提示，不改数据 */
  orphan?: boolean
}

/** UI 偏好：只落 `planner:todos:ui`，绝不进入 13 域 */
export interface TodoUiPrefs {
  view: TodoViewMode
  scope: TodoScope
  activeList: string
  groupBy: TodoGroupBy
  collapsed: Record<string, boolean>
}

export const DEFAULT_UI_PREFS: TodoUiPrefs = {
  view: 'list',
  scope: 'date',
  activeList: 'all',
  groupBy: 'status',
  collapsed: {},
}

export const ORPHAN_LIST_KEY = '__orphan_list__'
export const ORPHAN_CATEGORY_KEY = '__orphan_category__'
export const UNCATEGORIZED_KEY = '__uncategorized__'

export const QUADRANT_META = [
  {id: 'q1', name: '重要且紧急', color: '#ef4444'},
  {id: 'q2', name: '重要不紧急', color: '#f59e0b'},
  {id: 'q3', name: '紧急不重要', color: '#3b82f6'},
  {id: 'q4', name: '不重要不紧急', color: '#94a3b8'},
] as const

export type TodoViewProps = {
  sections: TodoSection[]
  batchMode: boolean
  selected: Set<string>
  collapsed: Record<string, boolean>
  lists: TodoList[]
  categories: Category[]
  onToggleCollapse: (key: string) => void
  onToggleGroupSelect: (items: Todo[], checked: boolean) => void
  onToggleSelect: (id: string) => void
  onToggleComplete: (todo: Todo) => void
  onTogglePin: (id: string) => void
  onDelete: (id: string) => void
  /** 未排期视图下逐条补日期（可选，列表视图现有行为不受影响） */
  onSchedule?: (id: string, date: string) => void
}
