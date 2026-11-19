/**
 * 领域类型单一真源（批次 0）
 *
 * 约束：
 * 1. 本文件不得引入任何运行时依赖，保持依赖图的叶子节点（只允许被 import type）。
 * 2. 批次 0 只做"类型收口 + 预留字段"，新增字段一律可选，避免改动既有页面的创建逻辑。
 * 3. 旧字段名（title / task / cycle 等）保留到批次 1，由 core/migrate.ts 映射后再收紧。
 * 4. priority 已在批次 2 收口为 quadrant（唯一真源），前端一律只读 quadrant。
 */

// ========== 基础别名 ==========

export type ID = string
/** YYYY-MM-DD */
export type ISODate = string
/** ISO 8601 时间字符串 */
export type ISODateTime = string
/** 0-24 的小数小时，如 9.5 表示 09:30 */
export type Hours = number

export type ModuleId =
  | 'today'
  | 'todos'
  | 'goals'
  | 'habits'
  | 'importantDays'
  | 'calendar'
  | 'timeStats'
  | 'pomodoro'
  | 'timer'
  | 'review'
  | 'memos'
  | 'finance'
  | 'guide'
  | 'settings'

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'
export type TodoType = 'task' | 'event'
export type TodoStatus = 'todo' | 'doing' | 'done'
export type TodoSource = 'manual' | 'habit'
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom' | 'monthly_day'
export type TargetPeriod = 'week' | 'month'
export type GoalLevel = 'year' | 'month' | 'week' | 'day'
export type ReviewPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type QuoteSourceType = 'lyric' | 'quote'
export type TimeBlockSource = 'todo' | 'habit' | 'pomodoro' | 'timer' | 'manual'
export type TimeBlockRefType = 'todo' | 'habit' | 'pomodoro' | 'timer'
export type TransactionType = 'expense' | 'income'
export type ImportantDayType = 'countdown' | 'countup'

// ========== 19 个实体 ==========

/** 1. 待办 / 日程事件 */
export interface Todo {
  id: ID
  title: string
  due_date?: ISODate
  due_time?: string
  completed: boolean
  list_id: string
  category_id?: string
  pinned: boolean
  status: string
  /** 旧字段：manual / habit（批次 1 映射到 TodoSource） */
  source: string
  habit_id?: ID
  completed_at?: ISODateTime
  // ---- 批次 0 预留（批次 1 由 migrate 落默认值） ----
  type?: TodoType
  start?: ISODateTime
  end?: ISODateTime
  /** 四象限（唯一真源；旧 priority 已在 migrate / sanitize 收口） */
  quadrant: Quadrant
  note?: string
}

/** 2. 待办清单 */
export interface TodoList {
  id: ID
  name: string
  color: string
  icon: string
}

/** 3. 分类 */
export interface Category {
  id: ID
  name: string
  color: string
  /** 批次 0 预留：规格要求分类可配图标 */
  icon?: string
}

/** 4. 目标（年/月/周/日四层，parent_id 自关联） */
export interface Goal {
  id: ID
  title: string
  /** 旧字段：yearly / monthly / weekly / daily（批次 1 映射到 level） */
  type: string
  parent_id?: ID
  progress: number
  status: string
  description?: string
  // ---- 批次 0 预留 ----
  level?: GoalLevel
  period_key?: string
  start_date?: ISODate
  end_date?: ISODate
}

/** 5. 习惯 */
export interface Habit {
  id: ID
  /** 旧字段：批次 1 映射到 name */
  title: string
  /** 旧字段：daily / weekdays / weekends / custom / monthly_day */
  frequency: string
  custom_days?: number[]
  check_dates: ISODate[]
  category_id?: ID
  // ---- 批次 0 预留 ----
  name?: string
  /**
   * 周期目标次数（进度条总格数）。与 frequency 正交：
   * - 正整数：按 target_period 统计
   * - 缺失 / 非法：自动回落到该频率在本周期应做的天数（旧数据行为不变）
   * - frequency='monthly_day' 时固定为 1
   */
  target_count?: number
  /** 目标周期：week（周一~周日）/ month（自然月）；monthly_day 强制 month */
  target_period?: TargetPeriod
  /** 每月某日（1-31），frequency = 'monthly_day' 时生效：强制自然月、目标 1 次 */
  monthly_day?: number
  day_of_month?: number
}

/** 6. 重要日子 */
export interface ImportantDay {
  id: ID
  title: string
  date: ISODate
  category: string
  pinned: boolean
  type: ImportantDayType
}

/** 7. 时间块 */
export interface TimeBlock {
  id: ID
  date: ISODate
  start: Hours
  end: Hours
  title: string
  category: string
  source?: string
  // ---- 批次 0 预留 ----
  duration?: number
  ref_type?: TimeBlockRefType
  ref_id?: ID
  /** 结构化关联待办；ref_type='pomodoro' 时承载 task_id，避免占用 ref 唯一索引 */
  linked_todo_id?: ID
}

/** 8. 番茄钟记录 */
export interface Pomodoro {
  id: ID
  date: ISODate
  duration: number
  /** 旧字段：任务标签文本（批次 1 映射到 task_label，并补 task_id） */
  task: string
  completed: boolean
  mode: string
  // ---- 批次 0 预留 ----
  task_id?: ID
  task_label?: string
  tag?: string
}

/** 9. 记账流水 */
export interface Transaction {
  id: ID
  date: ISODate
  /** 旧字段：expense / income */
  type: string
  category: string
  amount: number
  account: string
  note?: string
  // ---- 批次 0 预留 ----
  account_id?: ID
  /** M2：由周期账单自动生成时写入来源规则 id，用于列表「周期」徽标与幂等排查 */
  recurring_id?: ID
}

/** 10. 记账分类 */
export interface FinanceCategory {
  id: ID
  name: string
  type: TransactionType
  color: string
  icon: string
}

/** 11. 账户 */
export interface Account {
  id: ID
  name: string
  /**
   * 旧字段：历史录入的“当前余额”。
   * M2 起当前余额改由「期初 + 流水净额」派生，本字段只作迁移输入与兼容保留，不再作为读口径。
   */
  balance: number
  /** M2：期初余额（元，允许负）。存在时当前余额 = 期初 + 该账户全部流水净额 */
  opening_balance?: number
  icon: string
}

/** 12. 周期账单 */
export interface Recurring {
  id: ID
  name: string
  amount: number
  cycle: 'monthly' | 'yearly'
  day: number
  category: string
  account: string
  start_date: ISODate
  // ---- 批次 0 预留 ----
  next_date?: ISODate
  /** 自定义周期描述（批次 1 决定结构化方式） */
  custom_period?: string
  /** M2：收支方向；旧数据缺省按 expense */
  type?: TransactionType
  /** M2：关联账户 id；旧数据可为空，由 account 名称解析 */
  account_id?: ID
  /** M2：暂停后不再自动生成，恢复时不补记暂停期间 */
  paused?: boolean
}

/** 13. 备忘录：普通笔记 / 购物清单 */
export type MemoKind = 'note' | 'checklist'

/** 购物清单条目（存于 memos.items jsonb） */
export interface MemoItem {
  id: ID
  text: string
  done: boolean
  /** 数量：正整数，默认 1 */
  qty?: number
}

/** 13. 备忘录 */
export interface Memo {
  id: ID
  title?: string
  content: string
  category: string
  pinned: boolean
  completed: boolean
  created_at: ISODateTime
  kind: MemoKind
  items: MemoItem[]
}

/** 14. 复盘（四周期共用一张表，字段模板见 sections） */
export interface ReviewSections {
  done?: string
  undone?: string
  tomorrow?: string
  summary?: string
  next?: string
  [key: string]: string | undefined
}

export interface ReviewEntry {
  id: ID
  period_type: ReviewPeriod
  /** daily: YYYY-MM-DD / weekly: YYYY-Www / monthly: YYYY-MM / yearly: YYYY */
  period_key: string
  mood?: number
  sections: ReviewSections
  created_at: ISODateTime
  updated_at?: ISODateTime
}

/** 15. 主题 */
/** M3-4 主题质感参数：全部可选，缺省时走 :root 默认值 */
export interface ThemeVars {
  surface?: string
  cardAlpha?: number
  sidebarOverlay?: number
  /** stripes = 绝区零式倾斜斑马线 */
  texture?: 'none' | 'grid' | 'noise' | 'both' | 'stripes'
  accent?: string
  cut?: number
  monoNumbers?: boolean
  motion?: 'snappy' | 'calm'
  textTone?: 'dark' | 'light'
  /** 标题字体：impact = Impact / Arial Black 粗犷无衬线 */
  heading?: 'system' | 'impact'
  /** 大标题 glitch 故障阴影（绝区零风格） */
  glitch?: boolean
}

export interface Theme {
  id: string
  name: string
  primary: string
  sidebar: string
  bg?: string
  bgImage?: string
  overlay?: number
  blur?: number
  custom?: boolean
  /** 批次 0 预留：主题配套图标集（规格 N14，可选） */
  iconSet?: string
  /** M3-4 扩展：明日方舟质感参数 */
  vars?: ThemeVars
  createdAt?: string
  updatedAt?: string
}

/** 16. 用户资料 */
export interface UserMeta {
  id: ID
  nickname?: string
  avatar?: string
  email?: string
  updated_at?: ISODateTime
}

/** 17. 指南条目 */
export interface GuideLink {
  label: string
  url: string
}

export interface GuideEntry {
  id: string
  /** baoyan / intern / contest / coding / cet4 / kaoyan / scholarship / tips ... */
  category: string
  title: string
  icon?: string
  body: string[]
  links?: GuideLink[]
}

/** 18. 应用设置 */
export interface AppSettings {
  disabledModules?: ModuleId[]
  fontScale?: number
  updated_at?: ISODateTime
}

/** 19. 每日一句 */
export interface Quote {
  id: ID
  text: string
  author: string
  /** 作者成就，如"苹果公司创始人" */
  author_title?: string
  source_type: QuoteSourceType
  tags?: string[]
}

// ========== 聚合 ==========

/** 与 DataContext 的 13 个 state 一一对应（同时也是云表数据集） */
export interface DomainData {
  todos: Todo[]
  lists: TodoList[]
  categories: Category[]
  goals: Goal[]
  habits: Habit[]
  days: ImportantDay[]
  timeBlocks: TimeBlock[]
  pomodoros: Pomodoro[]
  transactions: Transaction[]
  memos: Memo[]
  financeCategories: FinanceCategory[]
  accounts: Account[]
  recurrings: Recurring[]
}

export type DomainKey = keyof DomainData

/** 本地全量数据：13 个云同步域 + 6 个仅本地/内置覆盖域 */
export interface LocalData extends DomainData {
  reviews: ReviewEntry[]
  themes: Theme[]
  quotes: Quote[]
  guides: GuideEntry[]
  settings: AppSettings
  user: UserMeta
}

/** 登录身份（Supabase auth），与用户资料 UserMeta 区分 */
export interface AuthUser {
  id: string
  email: string
}
