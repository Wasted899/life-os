/**
 * 数据迁移 / 规范化（批次 2：已接入运行时）
 *
 * 【唯一执行顺序，请勿调整】
 *   原始数据 → sanitize（lib/sanitize.ts，仅兜底占位）→ migrate（本文件，唯一出口，产出即最终结果）
 * 对外统一使用 normalizeLocalData()，不要在别处再手动 sanitize 后直接写 state。
 *
 * 本文件职责：
 * - 13 个云同步域的 old → new 映射（改名 / 强转 / 默认 / 合并 / 派生）
 * - transactions.account 的"账户名 → 账户 id"兼容解析
 * - 6 个本地实体的解析（reviews / themes / quotes / guides / settings / user）
 * - 导出载荷构造（带 schemaVersion，同时保留旧 v:5 以便旧版本仍能导入）
 *
 * 约束：
 * - 未知字段一律透传（先浅拷贝原对象，再覆盖规范字段），只统计数量，不丢弃
 * - 已知旧别名在规范化完成后删除，避免新旧字段并存
 * - 自身不读写 localStorage；备份与读写由 DataContext / core/storage 负责
 *
 * from = '*' 表示"旧结构没有来源字段"，该条只用于声明默认值或"保持 undefined"。
 */

import { uid } from './storage'
import { sanitizeAll } from '../lib/sanitize'
import type {
  Account,
  AppSettings,
  Category,
  DomainData,
  DomainKey,
  FinanceCategory,
  Goal,
  GuideEntry,
  Habit,
  ImportantDay,
  LocalData,
  Memo,
  ModuleId,
  Pomodoro,
  Quote,
  Recurring,
  ReviewEntry,
  ReviewPeriod,
  ReviewSections,
  Theme,
  TimeBlock,
  Todo,
  TodoList,
  Transaction,
  UserMeta,
} from './types'

export const MIGRATION_VERSION = 2

/** 旧导出里的 v（样本实测为 5），新导出继续携带，保证旧版本能读 */
export const DATA_VERSION = 5

/** 新导出标记与结构版本 */
export const EXPORT_FORMAT = 'planner-export'
export const EXPORT_SCHEMA_VERSION = 2

/** 13 个云同步域，顺序与 DataContext state 一致 */
export const DOMAIN_KEYS: readonly DomainKey[] = [
  'todos',
  'lists',
  'categories',
  'goals',
  'habits',
  'days',
  'timeBlocks',
  'pomodoros',
  'transactions',
  'memos',
  'financeCategories',
  'accounts',
  'recurrings',
]

/**
 * 旧字段 → 新字段映射规则（声明式文档，运行时由下方 normalizeXxx 实现，二者必须同步）。
 * kind 含义：
 * - keep    原样保留
 * - rename  仅改名（同类型）
 * - coerce  需要类型/枚举强转
 * - merge   多对一合并（同名 to 的多条规则按顺序兜底）
 * - derive  由其它字段计算得出
 * - default 旧结构无来源，补默认值
 * - drop    明确丢弃
 */
export type MappingKind = 'keep' | 'rename' | 'coerce' | 'merge' | 'derive' | 'default' | 'drop'

export interface MappingRule {
  from: string
  to: string
  kind: MappingKind
  /** kind='default' 的声明值（运行时由 normalizeXxx 落地） */
  defaultValue?: unknown
  note?: string
}

/** 顶层元数据：v → report.fromVersion（样本实测为 5） */
export const ROOT_MAPPING: readonly MappingRule[] = [
  { from: 'v', to: 'report.fromVersion', kind: 'coerce', note: '样本为 v:5；README 写的 v6 与导出不符' },
]

export const MAPPING_RULES: Record<DomainKey, readonly MappingRule[]> = {
  todos: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'title', to: 'title', kind: 'keep' },
    { from: 'name', to: 'title', kind: 'merge', note: 'title 缺失时用 name 兜底（依据 sanitizeTodos，待真实数据验证）' },
    { from: 'priority', to: 'priority', kind: 'keep', note: '类型层暂时保留，批次2 收口' },
    { from: 'priority', to: 'quadrant', kind: 'coerce', note: 'q1..q4 直取；非法值兜底 q2（待真实数据验证）' },
    { from: 'date', to: 'due_date', kind: 'rename', note: '统一为 YYYY-MM-DD（待真实数据验证）' },
    { from: 'time', to: 'due_time', kind: 'rename', note: '统一为 HH:mm（待真实数据验证）' },
    { from: 'completed', to: 'completed', kind: 'coerce', note: '字符串 "false" 等需转 boolean' },
    { from: 'listId', to: 'list_id', kind: 'merge', note: 'list_id 缺失时兜底' },
    { from: '*', to: 'list_id', kind: 'default', defaultValue: 'inbox', note: '样本 lists 仅收集箱，字符串主键符合规格 §2' },
    { from: 'categoryId', to: 'category_id', kind: 'merge', note: 'category_id 缺失时兜底' },
    { from: '*', to: 'category_id', kind: 'default', defaultValue: '', note: '空串表示未分类' },
    { from: 'pinned', to: 'pinned', kind: 'coerce' },
    { from: 'status', to: 'status', kind: 'keep' },
    { from: '*', to: 'status', kind: 'default', defaultValue: 'todo' },
    { from: 'source', to: 'source', kind: 'keep', note: '旧默认值为 "todo"，与 TodoSource(manual|habit) 不一致，待确认' },
    { from: '*', to: 'source', kind: 'default', defaultValue: 'todo' },
    { from: 'habitId', to: 'habit_id', kind: 'merge', note: 'null 需转 undefined（类型层不接受 null）' },
    { from: 'completed_at', to: 'completed_at', kind: 'keep' },
    { from: '*', to: 'type', kind: 'default', defaultValue: 'task', note: '旧结构无 type；日程事件需真实数据验证' },
    { from: '*', to: 'start', kind: 'default', note: '旧结构无来源，保持 undefined' },
    { from: '*', to: 'end', kind: 'default', note: '旧结构无来源，保持 undefined' },
    { from: 'note', to: 'note', kind: 'keep', note: 'sanitize 未显式读取，但可能随透传存在' },
  ],
  lists: [
    { from: 'id', to: 'id', kind: 'keep', note: '样本实测含 id=inbox（字符串）' },
    { from: 'name', to: 'name', kind: 'keep', note: '样本实测"收集箱"' },
    { from: 'color', to: 'color', kind: 'keep', note: '样本实测 #2563eb' },
    { from: 'icon', to: 'icon', kind: 'keep', note: '样本实测 📥' },
    { from: '*', to: 'name', kind: 'default', defaultValue: '未命名清单' },
    { from: '*', to: 'color', kind: 'default', defaultValue: '#2563eb' },
    { from: '*', to: 'icon', kind: 'default', defaultValue: '📁' },
  ],
  categories: [
    { from: 'id', to: 'id', kind: 'keep', note: '样本实测 c1..c5' },
    { from: 'name', to: 'name', kind: 'keep', note: '样本实测：学习/工作/生活/娱乐/其他' },
    { from: 'color', to: 'color', kind: 'keep' },
    { from: '*', to: 'icon', kind: 'default', note: '样本无 icon；保持 undefined，由 UI 用名称首字兜底' },
  ],
  goals: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'title', to: 'title', kind: 'keep' },
    { from: 'name', to: 'title', kind: 'merge', note: '待真实数据验证' },
    { from: 'period', to: 'type', kind: 'merge', note: '旧别名，待真实数据验证' },
    { from: 'type', to: 'type', kind: 'keep', note: '旧值 yearly/monthly/weekly/daily' },
    { from: 'type', to: 'level', kind: 'coerce', note: 'yearly→year、monthly→month、weekly→week、daily→day；其余保持 undefined' },
    { from: 'parentId', to: 'parent_id', kind: 'merge', note: 'null 需转 undefined' },
    { from: 'progress', to: 'progress', kind: 'coerce', note: '非数字转 0' },
    { from: '*', to: 'progress', kind: 'default', defaultValue: 0 },
    { from: 'status', to: 'status', kind: 'keep' },
    { from: '*', to: 'status', kind: 'default', defaultValue: 'active' },
    { from: 'desc', to: 'description', kind: 'merge', note: 'description 缺失时兜底' },
    { from: '*', to: 'period_key', kind: 'default', note: '旧结构无来源，待 D3 决策后由 level+日期派生' },
    { from: '*', to: 'start_date', kind: 'default', note: '旧结构无来源，保持 undefined' },
    { from: '*', to: 'end_date', kind: 'default', note: '旧结构无来源，保持 undefined' },
  ],
  habits: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'title', to: 'title', kind: 'keep' },
    { from: 'name', to: 'title', kind: 'merge', note: 'title 缺失时兜底（sanitizeHabits 已支持，待真实数据验证）' },
    { from: 'title', to: 'name', kind: 'derive', note: '新字段 name 由 title 复制，批次2 统一命名' },
    { from: 'frequency', to: 'frequency', kind: 'coerce', note: 'everyday→daily、weekday/workdays→weekdays、weekend→weekends、custom/weekly→custom，其余→daily' },
    { from: 'customDays', to: 'custom_days', kind: 'merge', note: 'custom 且为空时补 [1]' },
    { from: '*', to: 'custom_days', kind: 'default', defaultValue: [] },
    { from: 'check_dates', to: 'check_dates', kind: 'keep', note: '需为 YYYY-MM-DD[]，待真实数据验证' },
    { from: '*', to: 'check_dates', kind: 'default', defaultValue: [] },
    { from: 'categoryId', to: 'category_id', kind: 'merge' },
    { from: '*', to: 'category_id', kind: 'default', defaultValue: '' },
    { from: '*', to: 'target_count', kind: 'default', note: '旧结构无来源；待 D4 决策，暂不设默认值' },
    { from: '*', to: 'target_period', kind: 'default', note: '旧结构无来源；待 D4 决策' },
    { from: '*', to: 'monthly_day', kind: 'default', note: '旧结构无来源（旧 frequency 无 monthly_day）' },
    { from: '*', to: 'day_of_month', kind: 'default', note: '规格预留字段，旧结构无来源' },
  ],
  days: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'title', to: 'title', kind: 'keep' },
    { from: 'name', to: 'title', kind: 'merge', note: '待真实数据验证' },
    { from: 'date', to: 'date', kind: 'coerce', note: '统一为 YYYY-MM-DD；时间戳需格式化' },
    { from: 'category', to: 'category', kind: 'keep', note: '旧 sanitize 用 type 兜底 category，会把 countup/countdown 误当分类' },
    { from: 'type', to: 'category', kind: 'merge', note: '仅当 type ∉ {countdown,countup} 时才作为 category 兜底' },
    { from: 'type', to: 'type', kind: 'coerce', note: '仅 countup/countdown，其余→countdown' },
    { from: '*', to: 'type', kind: 'default', defaultValue: 'countdown' },
    { from: 'pinned', to: 'pinned', kind: 'coerce' },
  ],
  timeBlocks: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'date', to: 'date', kind: 'coerce', note: '统一为 YYYY-MM-DD' },
    { from: 'start', to: 'start', kind: 'coerce', note: 'parseFloat；非法值兜底 9' },
    { from: 'end', to: 'end', kind: 'coerce', note: 'parseFloat；非法值兜底 10；允许 >24 的脏数据被保留以便清理' },
    { from: 'title', to: 'title', kind: 'keep' },
    { from: 'name', to: 'title', kind: 'merge', note: '待真实数据验证' },
    { from: 'category', to: 'category', kind: 'keep' },
    { from: 'source', to: 'source', kind: 'keep' },
    { from: 'end - start', to: 'duration', kind: 'derive', note: '仅 end>start 时计算；跨天记录保持 undefined' },
    { from: '*', to: 'ref_type', kind: 'default', note: '旧结构无来源；批次2 写入口时补' },
    { from: '*', to: 'ref_id', kind: 'default', note: '旧结构无来源' },
  ],
  pomodoros: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'date', to: 'date', kind: 'coerce' },
    { from: 'duration', to: 'duration', kind: 'coerce', note: '非数字兜底 25' },
    { from: '*', to: 'duration', kind: 'default', defaultValue: 25 },
    { from: 'task', to: 'task', kind: 'keep', note: '类型层暂时保留' },
    { from: 'task', to: 'task_label', kind: 'derive', note: '自由文本，无法反查任务 id' },
    { from: 'completed', to: 'completed', kind: 'coerce', note: '缺省视为 true' },
    { from: '*', to: 'completed', kind: 'default', defaultValue: true },
    { from: 'mode', to: 'mode', kind: 'keep' },
    { from: '*', to: 'mode', kind: 'default', defaultValue: 'countdown' },
    { from: '*', to: 'task_id', kind: 'default', note: '旧结构只有文本 task，无法可靠映射到 id' },
    { from: '*', to: 'tag', kind: 'default', note: '旧结构无来源' },
  ],
  transactions: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'date', to: 'date', kind: 'coerce', note: '统一为 YYYY-MM-DD' },
    { from: 'type', to: 'type', kind: 'coerce', note: 'income/expense，其余→expense' },
    { from: '*', to: 'type', kind: 'default', defaultValue: 'expense' },
    { from: 'category', to: 'category', kind: 'keep' },
    { from: 'amount', to: 'amount', kind: 'coerce', note: 'parseFloat；非法值 0' },
    { from: '*', to: 'amount', kind: 'default', defaultValue: 0 },
    { from: 'account', to: 'account', kind: 'keep', note: '旧值疑似账户显示名（如"微信"），非 id' },
    { from: '*', to: 'account', kind: 'default', defaultValue: '微信' },
    { from: 'remark', to: 'note', kind: 'merge', note: 'note 缺失时兜底' },
    { from: 'account', to: 'account_id', kind: 'derive', note: '兼容解析：先按 id 匹配，再按账户名精确匹配；匹配不到则 account 保留原文、account_id 留空（见 resolveAccount）' },
  ],
  memos: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'title', to: 'title', kind: 'keep' },
    { from: '*', to: 'title', kind: 'default', defaultValue: '' },
    { from: 'text', to: 'content', kind: 'merge', note: 'content 缺失时兜底' },
    { from: 'category', to: 'category', kind: 'keep' },
    { from: '*', to: 'category', kind: 'default', defaultValue: '其他' },
    { from: 'pinned', to: 'pinned', kind: 'coerce' },
    { from: 'completed', to: 'completed', kind: 'coerce' },
    { from: 'created_at', to: 'created_at', kind: 'coerce', note: '非法值需转 ISO 字符串' },
    { from: '*', to: 'created_at', kind: 'default', note: '缺失时由运行时写入当前 ISO 时间' },
  ],
  financeCategories: [
    { from: 'id', to: 'id', kind: 'keep', note: '样本实测 fc1..fc6 / fi1..fi4' },
    { from: 'name', to: 'name', kind: 'keep', note: '样本实测 10 条全部有值' },
    { from: 'type', to: 'type', kind: 'coerce', note: '仅 expense/income；其余→expense' },
    { from: '*', to: 'type', kind: 'default', defaultValue: 'expense' },
    { from: 'color', to: 'color', kind: 'keep' },
    { from: 'icon', to: 'icon', kind: 'keep', note: '样本实测均有 emoji 图标' },
  ],
  accounts: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'name', to: 'name', kind: 'keep' },
    { from: '*', to: 'name', kind: 'default', defaultValue: '账户' },
    { from: 'balance', to: 'balance', kind: 'coerce', note: '非数字转 0' },
    { from: '*', to: 'balance', kind: 'default', defaultValue: 0 },
    { from: 'icon', to: 'icon', kind: 'keep' },
    { from: '*', to: 'icon', kind: 'default', defaultValue: '💳' },
  ],
  recurrings: [
    { from: 'id', to: 'id', kind: 'keep' },
    { from: 'name', to: 'name', kind: 'keep' },
    { from: '*', to: 'name', kind: 'default', defaultValue: '周期账单' },
    { from: 'amount', to: 'amount', kind: 'coerce', note: '非数字转 0' },
    { from: '*', to: 'amount', kind: 'default', defaultValue: 0 },
    { from: 'cycle', to: 'cycle', kind: 'coerce', note: '仅 monthly/yearly；其余→monthly' },
    { from: '*', to: 'cycle', kind: 'default', defaultValue: 'monthly' },
    { from: 'day', to: 'day', kind: 'coerce', note: '钳制到 1..31；非数字→1' },
    { from: '*', to: 'day', kind: 'default', defaultValue: 1 },
    { from: 'category', to: 'category', kind: 'keep' },
    { from: '*', to: 'category', kind: 'default', defaultValue: '其他' },
    { from: 'account', to: 'account', kind: 'keep' },
    { from: '*', to: 'account', kind: 'default', defaultValue: '微信' },
    { from: 'startDate', to: 'start_date', kind: 'merge', note: 'start_date 缺失时兜底' },
    { from: 'start_date + cycle + day', to: 'next_date', kind: 'derive', note: '待确认在 migrate 还是运行时计算' },
    { from: '*', to: 'custom_period', kind: 'default', note: '旧结构只支持 monthly/yearly' },
  ],
}

/**
 * 已纳入规范化的字段白名单（用于 unknownKeys 统计，不参与实际映射）。
 * 包含：规范字段 + 旧别名 + 新预留字段。
 */
export const KNOWN_KEYS: Record<DomainKey, readonly string[]> = {
  todos: ['id', 'title', 'name', 'priority', 'quadrant', 'date', 'due_date', 'time', 'due_time', 'completed', 'list_id', 'listId', 'category_id', 'categoryId', 'pinned', 'status', 'source', 'habit_id', 'habitId', 'completed_at', 'type', 'start', 'end', 'note'],
  lists: ['id', 'name', 'color', 'icon'],
  categories: ['id', 'name', 'color', 'icon'],
  goals: ['id', 'title', 'name', 'type', 'period', 'level', 'parent_id', 'parentId', 'progress', 'status', 'description', 'desc', 'period_key', 'start_date', 'end_date'],
  habits: ['id', 'title', 'name', 'frequency', 'custom_days', 'customDays', 'check_dates', 'category_id', 'categoryId', 'target_count', 'target_period', 'monthly_day', 'day_of_month'],
  days: ['id', 'title', 'name', 'date', 'category', 'pinned', 'type'],
  timeBlocks: ['id', 'date', 'start', 'end', 'title', 'name', 'category', 'source', 'duration', 'ref_type', 'ref_id'],
  pomodoros: ['id', 'date', 'duration', 'task', 'completed', 'mode', 'task_id', 'task_label', 'tag'],
  transactions: ['id', 'date', 'type', 'category', 'amount', 'account', 'note', 'remark', 'account_id'],
  memos: ['id', 'title', 'content', 'text', 'category', 'pinned', 'completed', 'created_at'],
  financeCategories: ['id', 'name', 'type', 'color', 'icon'],
  accounts: ['id', 'name', 'balance', 'icon'],
  recurrings: ['id', 'name', 'amount', 'cycle', 'day', 'category', 'account', 'start_date', 'startDate', 'next_date', 'custom_period'],
}

export type MigrationIssueCode =
  | 'root-not-object'
  | 'domain-not-array'
  | 'item-not-object'
  | 'missing-id'
  | 'unknown-key-kept'

export interface MigrationIssue {
  domain: DomainKey | 'root'
  /** 形如 todos[3].id */
  path: string
  code: MigrationIssueCode
  note?: string
}

export interface DomainStat {
  input: number
  output: number
  dropped: number
  unknownKeys: number
}

export interface MigrationReport {
  /** 来源版本号（旧导出里的 v），无法识别时为 null */
  fromVersion: number | null
  toVersion: number
  durationMs: number
  issues: MigrationIssue[]
  stats: Record<DomainKey, DomainStat>
}

export interface MigrationResult {
  data: DomainData
  report: MigrationReport
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const createEmptyData = (): DomainData => ({
  todos: [],
  lists: [],
  categories: [],
  goals: [],
  habits: [],
  days: [],
  timeBlocks: [],
  pomodoros: [],
  transactions: [],
  memos: [],
  financeCategories: [],
  accounts: [],
  recurrings: [],
})

const createEmptyStats = (): Record<DomainKey, DomainStat> => {
  const stats = {} as Record<DomainKey, DomainStat>
  for (const domain of DOMAIN_KEYS) {
    stats[domain] = { input: 0, output: 0, dropped: 0, unknownKeys: 0 }
  }
  return stats
}

/** 未知字段透传：浅拷贝原对象，不删除、不改名、不补值 */
export const passthroughUnknown = (source: Record<string, unknown>): Record<string, unknown> => ({ ...source })

/** 统计白名单之外的字段名（只统计，不丢弃） */
export const collectUnknownKeys = (
  source: Record<string, unknown>,
  knownKeys: readonly string[],
): string[] => Object.keys(source).filter((key) => !knownKeys.includes(key))

// ========== 基础转换工具 ==========

const hasValue = (value: unknown): boolean => value !== undefined && value !== null && value !== ''

const pick = (...values: unknown[]): unknown => {
  for (const value of values) {
    if (hasValue(value)) return value
  }
  return undefined
}

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

const asOptionalText = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() ? value : undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

const asBool = (value: unknown, def: boolean): boolean => {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return def
}

const asNum = (value: unknown, def: number): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : def
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

const todayISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 统一为 YYYY-MM-DD。无法解析但仍有原文时保留原文，避免静默丢数据 */
const asDate = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (!raw) return undefined
  const matched = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (matched) return `${matched[1]}-${pad2(Number(matched[2]))}-${pad2(Number(matched[3]))}`
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
  }
  return raw
}

/** 统一为 HH:mm；无法识别时保留原文 */
const asTime = (value: unknown): string => {
  const raw = asText(value).trim()
  if (!raw) return ''
  const matched = raw.match(/^(\d{1,2}):(\d{1,2})/)
  if (!matched) return raw
  const hour = Math.min(23, Math.max(0, Number(matched[1])))
  const minute = Math.min(59, Math.max(0, Number(matched[2])))
  return `${pad2(hour)}:${pad2(minute)}`
}

const QUADRANTS = ['q1', 'q2', 'q3', 'q4'] as const
type QuadrantValue = (typeof QUADRANTS)[number]
const asQuadrant = (value: unknown): QuadrantValue => {
  const raw = asText(value)
  return (QUADRANTS as readonly string[]).includes(raw) ? (raw as QuadrantValue) : 'q2'
}

const GOAL_LEVELS: Record<string, string> = {
  yearly: 'year',
  monthly: 'month',
  weekly: 'week',
  daily: 'day',
  year: 'year',
  month: 'month',
  week: 'week',
  day: 'day',
}

const asFrequency = (value: unknown): string => {
  const raw = asText(value)
  if (raw === 'daily' || raw === 'everyday') return 'daily'
  if (raw === 'weekdays' || raw === 'weekday' || raw === 'workdays') return 'weekdays'
  if (raw === 'weekends' || raw === 'weekend') return 'weekends'
  if (raw === 'custom' || raw === 'weekly') return 'custom'
  if (raw === 'monthly_day') return 'monthly_day'
  return 'daily'
}

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => asDate(item)).filter((item): item is string => !!item) : []

interface NormalizeContext {
  accounts: Account[]
  today: string
}

// ========== 各实体规范化（实现 MAPPING_RULES 的运行时行为） ==========

function normalizeTodo(item: Record<string, unknown>): Todo {
  const out = { ...item } as Record<string, unknown>
  const title = asText(pick(item.title, item.name)) || '未命名任务'
  out.id = asText(item.id) || uid()
  out.title = title
  out.priority = asOptionalText(pick(item.priority, item.quadrant)) || 'q2'
  out.quadrant = asQuadrant(pick(item.quadrant, item.priority))
  out.due_date = asDate(pick(item.due_date, item.date))
  out.due_time = asTime(pick(item.due_time, item.time))
  out.completed = asBool(item.completed, false)
  out.list_id = asOptionalText(pick(item.list_id, item.listId)) || 'inbox'
  out.category_id = asOptionalText(pick(item.category_id, item.categoryId)) || ''
  out.pinned = asBool(item.pinned, false)
  out.status = asOptionalText(item.status) || 'todo'
  out.source = asOptionalText(item.source) || 'todo'
  out.habit_id = asOptionalText(pick(item.habit_id, item.habitId))
  out.completed_at = asOptionalText(item.completed_at)
  out.type = item.type === 'event' ? 'event' : 'task'
  out.start = asOptionalText(item.start)
  out.end = asOptionalText(item.end)
  out.note = asOptionalText(item.note)
  delete out.name
  delete out.date
  delete out.time
  delete out.listId
  delete out.categoryId
  delete out.habitId
  return out as unknown as Todo
}

function normalizeList(item: Record<string, unknown>): TodoList {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.name = asText(item.name) || '未命名清单'
  out.color = asText(item.color) || '#2563eb'
  out.icon = asText(item.icon) || '📁'
  return out as unknown as TodoList
}

function normalizeCategory(item: Record<string, unknown>): Category {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.name = asText(item.name) || '未分类'
  out.color = asText(item.color) || '#94a3b8'
  const icon = asOptionalText(item.icon)
  if (icon) out.icon = icon
  else delete out.icon
  return out as unknown as Category
}

function normalizeGoal(item: Record<string, unknown>): Goal {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.title = asText(pick(item.title, item.name)) || '未命名目标'
  out.type = asOptionalText(pick(item.type, item.period)) || 'yearly'
  const level = GOAL_LEVELS[asText(out.type)]
  if (level) out.level = level
  else delete out.level
  out.parent_id = asOptionalText(pick(item.parent_id, item.parentId))
  out.progress = asNum(item.progress, 0)
  out.status = asOptionalText(item.status) || 'active'
  out.description = asText(pick(item.description, item.desc))
  out.period_key = asOptionalText(item.period_key)
  out.start_date = asDate(item.start_date)
  out.end_date = asDate(item.end_date)
  delete out.name
  delete out.period
  delete out.parentId
  delete out.desc
  return out as unknown as Goal
}

function normalizeHabit(item: Record<string, unknown>): Habit {
  const out = { ...item } as Record<string, unknown>
  const title = asText(pick(item.title, item.name)) || '未命名习惯'
  out.id = asText(item.id) || uid()
  out.title = title
  out.name = title
  out.frequency = asFrequency(item.frequency)
  const rawDays = Array.isArray(item.custom_days) && item.custom_days.length
    ? item.custom_days
    : Array.isArray(item.customDays)
      ? item.customDays
      : Array.isArray(item.custom_days)
        ? item.custom_days
        : []
  const customDays = rawDays
    .map((day) => asNum(day, -1))
    .filter((day) => day >= 0 && day <= 6)
  out.custom_days = out.frequency === 'custom' && customDays.length === 0 ? [1] : customDays
  out.check_dates = normalizeStringArray(item.check_dates)
  out.category_id = asOptionalText(pick(item.category_id, item.categoryId)) || ''
  if (hasValue(item.target_count)) out.target_count = asNum(item.target_count, 0)
  if (hasValue(item.target_period)) out.target_period = asText(item.target_period)
  if (hasValue(item.monthly_day)) out.monthly_day = Math.min(31, Math.max(1, asNum(item.monthly_day, 1)))
  if (hasValue(item.day_of_month)) out.day_of_month = Math.min(31, Math.max(1, asNum(item.day_of_month, 1)))
  delete out.customDays
  delete out.categoryId
  return out as unknown as Habit
}

function normalizeDay(item: Record<string, unknown>, ctx: NormalizeContext): ImportantDay {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.title = asText(pick(item.title, item.name)) || '未命名事件'
  out.date = asDate(item.date) || ctx.today
  const rawType = asText(item.type)
  const typeIsSpecial = rawType === 'countdown' || rawType === 'countup'
  const rawCategory = asText(item.category)
  const categoryIsValid = !!rawCategory && rawCategory !== 'countdown' && rawCategory !== 'countup'
  out.category = categoryIsValid ? rawCategory : (!typeIsSpecial && rawType ? rawType : '其他')
  out.type = rawType === 'countup' ? 'countup' : 'countdown'
  out.pinned = asBool(item.pinned, false)
  delete out.name
  return out as unknown as ImportantDay
}

function normalizeTimeBlock(item: Record<string, unknown>, ctx: NormalizeContext): TimeBlock {
  const out = { ...item } as Record<string, unknown>
  const start = asNum(item.start, 9)
  const end = asNum(item.end, 10)
  out.id = asText(item.id) || uid()
  out.date = asDate(item.date) || ctx.today
  out.start = start
  out.end = end
  out.title = asText(pick(item.title, item.name)) || '未命名'
  out.category = asOptionalText(item.category) || '其他'
  out.source = asOptionalText(item.source) || ''
  out.duration = end > start ? Math.round((end - start) * 100) / 100 : undefined
  out.ref_type = asOptionalText(item.ref_type)
  out.ref_id = asOptionalText(item.ref_id)
  delete out.name
  return out as unknown as TimeBlock
}

function normalizePomodoro(item: Record<string, unknown>, ctx: NormalizeContext): Pomodoro {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.date = asDate(item.date) || ctx.today
  out.duration = asNum(item.duration, 25)
  out.task = asText(item.task)
  out.task_label = asText(pick(item.task_label, item.task))
  out.completed = asBool(item.completed, true)
  out.mode = asOptionalText(item.mode) || 'countdown'
  out.task_id = asOptionalText(item.task_id)
  out.tag = asOptionalText(item.tag)
  return out as unknown as Pomodoro
}

interface AccountResolution {
  account: string
  account_id?: string
  matched: 'id' | 'name' | 'none'
}

/**
 * account 兼容解析（规则固定，勿混用显示名与 id）：
 * 1. 已有 account_id 且账户集合中存在 → 直接采用，account 同步为账户名
 * 2. account 字符串本身就是账户 id → 转成 id，account 同步为账户名
 * 3. account 字符串能精确匹配账户名（trim 后）→ 转成 id，account 保留账户名
 * 4. 匹配不到 → 降级：account 保留原文，account_id 留空
 */
export function resolveAccount(
  value: unknown,
  existingId: unknown,
  accounts: Account[],
): AccountResolution {
  const rawId = asOptionalText(existingId)
  const raw = asText(value).trim()

  if (rawId) {
    const byId = accounts.find((account) => account.id === rawId)
    if (byId) return { account: byId.name, account_id: byId.id, matched: 'id' }
  }
  if (!raw) return { account: '', account_id: rawId, matched: rawId ? 'id' : 'none' }

  const byId = accounts.find((account) => account.id === raw)
  if (byId) return { account: byId.name, account_id: byId.id, matched: 'id' }

  const byName = accounts.find((account) => (account.name || '').trim() === raw)
  if (byName) return { account: byName.name, account_id: byName.id, matched: 'name' }

  return { account: raw, account_id: rawId, matched: 'none' }
}

function normalizeTransaction(
  item: Record<string, unknown>,
  ctx: NormalizeContext,
): Transaction {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.date = asDate(item.date) || ctx.today
  out.type = item.type === 'income' ? 'income' : 'expense'
  out.category = asOptionalText(item.category) || '其他'
  out.amount = asNum(item.amount, 0)
  out.note = asText(pick(item.note, item.remark))
  const resolved = resolveAccount(item.account, item.account_id, ctx.accounts)
  out.account = resolved.account || (resolved.account_id ? '' : '微信')
  out.account_id = resolved.account_id
  delete out.remark
  return out as unknown as Transaction
}

function normalizeMemo(item: Record<string, unknown>): Memo {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.title = asText(item.title)
  out.content = asText(pick(item.content, item.text))
  out.category = asOptionalText(item.category) || '其他'
  out.pinned = asBool(item.pinned, false)
  out.completed = asBool(item.completed, false)
  out.created_at = asOptionalText(item.created_at) || new Date().toISOString()
  delete out.text
  return out as unknown as Memo
}

function normalizeFinanceCategory(item: Record<string, unknown>): FinanceCategory {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.name = asText(item.name) || '未分类'
  out.type = item.type === 'income' ? 'income' : 'expense'
  out.color = asText(item.color) || '#94a3b8'
  out.icon = asText(item.icon) || '📦'
  return out as unknown as FinanceCategory
}

function normalizeAccount(item: Record<string, unknown>): Account {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.name = asText(item.name) || '账户'
  out.balance = asNum(item.balance, 0)
  out.icon = asText(item.icon) || '💳'
  return out as unknown as Account
}

function normalizeRecurring(item: Record<string, unknown>, ctx: NormalizeContext): Recurring {
  const out = { ...item } as Record<string, unknown>
  out.id = asText(item.id) || uid()
  out.name = asText(item.name) || '周期账单'
  out.amount = asNum(item.amount, 0)
  out.cycle = item.cycle === 'yearly' ? 'yearly' : 'monthly'
  out.day = Math.min(31, Math.max(1, Math.round(asNum(item.day, 1))))
  out.category = asOptionalText(item.category) || '其他'
  out.account = asOptionalText(item.account) || '微信'
  out.start_date = asDate(pick(item.start_date, item.startDate)) || ctx.today
  out.next_date = asDate(item.next_date)
  out.custom_period = asOptionalText(item.custom_period)
  delete out.startDate
  return out as unknown as Recurring
}

function normalizeDomainItem(
  domain: DomainKey,
  item: Record<string, unknown>,
  ctx: NormalizeContext,
): unknown {
  switch (domain) {
    case 'todos':
      return normalizeTodo(item)
    case 'lists':
      return normalizeList(item)
    case 'categories':
      return normalizeCategory(item)
    case 'goals':
      return normalizeGoal(item)
    case 'habits':
      return normalizeHabit(item)
    case 'days':
      return normalizeDay(item, ctx)
    case 'timeBlocks':
      return normalizeTimeBlock(item, ctx)
    case 'pomodoros':
      return normalizePomodoro(item, ctx)
    case 'transactions':
      return normalizeTransaction(item, ctx)
    case 'memos':
      return normalizeMemo(item)
    case 'financeCategories':
      return normalizeFinanceCategory(item)
    case 'accounts':
      return normalizeAccount(item)
    case 'recurrings':
      return normalizeRecurring(item, ctx)
    default:
      return { ...item }
  }
}

/**
 * 主入口：原始对象 → 规范化结果 + 变更/丢弃项报告。
 * 兼容两种输入形态：{ todos, lists, ... } 与 { v, data: { todos, ... } }。
 */
export function migrate(raw: unknown): MigrationResult {
  const startedAt = Date.now()
  const issues: MigrationIssue[] = []
  const stats = createEmptyStats()
  const data = createEmptyData()

  if (!isPlainObject(raw)) {
    issues.push({ domain: 'root', path: '$', code: 'root-not-object' })
    return {
      data,
      report: {
        fromVersion: null,
        toVersion: MIGRATION_VERSION,
        durationMs: Date.now() - startedAt,
        issues,
        stats,
      },
    }
  }

  const fromVersion = typeof raw.v === 'number' ? raw.v : null
  const source = isPlainObject(raw.data) ? raw.data : raw
  const bag = data as unknown as Record<DomainKey, unknown[]>
  const ctx: NormalizeContext = { accounts: [], today: todayISO() }

  // accounts 必须先规范化，transactions.account 的"名字 → id"解析依赖它
  if (Array.isArray(source.accounts)) {
    stats.accounts.input = source.accounts.length
    source.accounts.forEach((item, index) => {
      if (!isPlainObject(item)) {
        stats.accounts.dropped += 1
        issues.push({
          domain: 'accounts',
          path: `accounts[${index}]`,
          code: 'item-not-object',
          note: `实际为 ${item === null ? 'null' : typeof item}`,
        })
        return
      }
      if (typeof item.id !== 'string' || item.id.length === 0) {
        issues.push({ domain: 'accounts', path: `accounts[${index}].id`, code: 'missing-id' })
      }
      stats.accounts.unknownKeys += collectUnknownKeys(item, KNOWN_KEYS.accounts).length
      ctx.accounts.push(normalizeAccount(item))
    })
    bag.accounts = ctx.accounts as unknown as unknown[]
    stats.accounts.output = ctx.accounts.length
  }

  for (const domain of DOMAIN_KEYS) {
    if (domain === 'accounts') continue
    const input = source[domain]
    if (input === undefined) continue

    if (!Array.isArray(input)) {
      issues.push({
        domain,
        path: domain,
        code: 'domain-not-array',
        note: `期望数组，实际为 ${input === null ? 'null' : typeof input}`,
      })
      continue
    }

    stats[domain].input = input.length
    const output: unknown[] = []

    input.forEach((item, index) => {
      if (!isPlainObject(item)) {
        stats[domain].dropped += 1
        issues.push({
          domain,
          path: `${domain}[${index}]`,
          code: 'item-not-object',
          note: `实际为 ${item === null ? 'null' : typeof item}`,
        })
        return
      }

      if (typeof item.id !== 'string' || item.id.length === 0) {
        issues.push({ domain, path: `${domain}[${index}].id`, code: 'missing-id' })
      }

      stats[domain].unknownKeys += collectUnknownKeys(item, KNOWN_KEYS[domain]).length
      output.push(normalizeDomainItem(domain, item, ctx))
    })

    bag[domain] = output
    stats[domain].output = output.length
  }

  return {
    data,
    report: {
      fromVersion,
      toVersion: MIGRATION_VERSION,
      durationMs: Date.now() - startedAt,
      issues,
      stats,
    },
  }
}

/**
 * 运行时唯一入口：sanitize（兜底占位）→ migrate（最终结果）。
 * 顺序写死在这里，调用方不要再自行拼装。
 */
export function normalizeLocalData(raw: unknown): MigrationResult {
  if (!isPlainObject(raw)) return migrate(raw)
  const source = isPlainObject(raw.data) ? raw.data : raw
  const sanitized = sanitizeAll(source)
  // 保留旧的 v，供 fromVersion 报告使用
  return migrate(isPlainObject(sanitized) ? { ...sanitized, v: raw.v } : raw)
}

/** 语义别名：用于 localStorage 初始化时传入整个快照对象 */
export function migrateSnapshot(snapshot: Record<string, unknown>): MigrationResult {
  return normalizeLocalData(snapshot)
}

// ========== 6 个本地实体（本地存储 + 导出/导入） ==========

export interface LocalExtras {
  reviews: ReviewEntry[]
  themes: Theme[]
  quotes: Quote[]
  guides: GuideEntry[]
  settings: AppSettings
  user: UserMeta
}

const MODULE_IDS: readonly ModuleId[] = [
  'today',
  'todos',
  'goals',
  'habits',
  'importantDays',
  'calendar',
  'timeStats',
  'pomodoro',
  'review',
  'memos',
  'finance',
  'guide',
  'settings',
]

const isModuleId = (value: unknown): value is ModuleId =>
  typeof value === 'string' && (MODULE_IDS as readonly string[]).includes(value)

function normalizeReview(item: unknown): ReviewEntry | null {
  if (!isPlainObject(item)) return null

  let periodType: ReviewPeriod | undefined
  let periodKey = ''
  const explicitType = asText(item.period_type)
  const explicitKey = asText(item.period_key)

  if (explicitType && explicitKey && ['daily', 'weekly', 'monthly', 'yearly'].includes(explicitType)) {
    periodType = explicitType as ReviewPeriod
    periodKey = explicitKey
  } else if (hasValue(item.date)) {
    periodType = 'daily'
    periodKey = asDate(item.date) || asText(item.date)
  } else if (hasValue(item.week)) {
    periodType = 'weekly'
    periodKey = asText(item.week)
  } else if (hasValue(item.month)) {
    periodType = 'monthly'
    periodKey = asText(item.month)
  } else if (hasValue(item.year)) {
    periodType = 'yearly'
    periodKey = asText(item.year)
  }

  if (!periodType || !periodKey) return null

  const sections: ReviewSections = {}
  if (isPlainObject(item.sections)) {
    for (const [key, value] of Object.entries(item.sections)) {
      if (typeof value === 'string') sections[key] = value
    }
  }
  const put = (key: string, value: unknown) => {
    if (!sections[key] && typeof value === 'string' && value) sections[key] = value
  }
  if (periodType === 'daily') {
    put('done', item.done)
    put('undone', item.undone)
    put('tomorrow', item.tomorrow)
  } else {
    put('summary', item.summary)
    const nextRaw = periodType === 'weekly' ? item.next_week : periodType === 'monthly' ? item.next_month : item.next_year
    put('next', pick(nextRaw, item.next))
  }

  const mood = item.mood === undefined ? undefined : Math.min(5, Math.max(1, Math.round(asNum(item.mood, 3))))

  return {
    id: asText(item.id) || `${periodType}:${periodKey}`,
    period_type: periodType,
    period_key: periodKey,
    mood,
    sections,
    created_at: asOptionalText(item.created_at) || new Date().toISOString(),
    updated_at: asOptionalText(item.updated_at),
  }
}

function normalizeTheme(item: unknown): Theme | null {
  if (!isPlainObject(item)) return null
  const id = asText(item.id)
  const name = asText(item.name)
  if (!id || !name) return null
  const theme: Theme = {
    id,
    name,
    primary: asText(item.primary) || '#2563eb',
    sidebar: asText(item.sidebar) || '#ffffff',
    custom: item.custom !== false,
  }
  if (hasValue(item.bg)) theme.bg = asText(item.bg)
  if (hasValue(item.bgImage)) theme.bgImage = asText(item.bgImage)
  if (hasValue(item.overlay)) theme.overlay = asNum(item.overlay, 0)
  if (hasValue(item.blur)) theme.blur = asNum(item.blur, 0)
  if (hasValue(item.iconSet)) theme.iconSet = asText(item.iconSet)
  return theme
}

function normalizeQuote(item: unknown): Quote | null {
  if (!isPlainObject(item)) return null
  const text = asText(item.text)
  if (!text) return null
  const quote: Quote = {
    id: asText(item.id) || uid(),
    text,
    author: asText(item.author),
    source_type: item.source_type === 'lyric' ? 'lyric' : 'quote',
  }
  if (hasValue(item.author_title)) quote.author_title = asText(item.author_title)
  if (Array.isArray(item.tags)) {
    quote.tags = item.tags.filter((tag): tag is string => typeof tag === 'string')
  }
  return quote
}

function normalizeGuide(item: unknown): GuideEntry | null {
  if (!isPlainObject(item)) return null
  const title = asText(item.title)
  if (!title) return null
  const guide: GuideEntry = {
    id: asText(item.id) || uid(),
    category: asText(item.category) || 'tips',
    title,
    body: Array.isArray(item.body) ? item.body.filter((line): line is string => typeof line === 'string') : [],
  }
  if (hasValue(item.icon)) guide.icon = asText(item.icon)
  if (Array.isArray(item.links)) {
    const links = item.links
      .filter(isPlainObject)
      .map((link) => ({ label: asText(link.label), url: asText(link.url) }))
      .filter((link) => !!link.label && !!link.url)
    if (links.length) guide.links = links
  }
  return guide
}

const pickArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/**
 * 解析 6 个本地实体，兼容三种来源：
 * - 新导出：{ reviews, themes, quotes, guides, settings, user }
 * - 手工数据：{ user_meta, disabledModules, p_nick, p_avatar ... }
 * - 本地读取：调用方把旧 key 的内容整理成 reviews / themes / p_disabled / p_nick 后传入
 */
export function migrateExtras(raw: unknown): LocalExtras {
  const source = isPlainObject(raw) ? (isPlainObject(raw.data) ? raw.data : raw) : {}

  const reviews = pickArray(source.reviews)
    .map(normalizeReview)
    .filter((item): item is ReviewEntry => !!item)

  const themes = pickArray(source.themes)
    .filter((item) => !isPlainObject(item) || item.custom !== false)
    .map(normalizeTheme)
    .filter((item): item is Theme => !!item)

  const quotes = pickArray(source.quotes).map(normalizeQuote).filter((item): item is Quote => !!item)

  const guides = pickArray(source.guides)
    .map(normalizeGuide)
    .filter((item): item is GuideEntry => !!item)

  const rawSettings = isPlainObject(source.settings) ? source.settings : {}
  const disabledRaw = Array.isArray(rawSettings.disabledModules)
    ? rawSettings.disabledModules
    : Array.isArray(source.p_disabled)
      ? source.p_disabled
      : Array.isArray(source.disabledModules)
        ? source.disabledModules
        : []
  const settings: AppSettings = {
    disabledModules: disabledRaw.filter(isModuleId),
  }
  if (hasValue(rawSettings.fontScale)) settings.fontScale = asNum(rawSettings.fontScale, 1)
  if (hasValue(rawSettings.updated_at)) settings.updated_at = asText(rawSettings.updated_at)

  const rawUser = isPlainObject(source.user)
    ? source.user
    : isPlainObject(source.user_meta)
      ? source.user_meta
      : {}
  const user: UserMeta = {
    id: asText(rawUser.id) || 'local',
  }
  const nickname = asOptionalText(pick(rawUser.nickname, source.p_nick, source.nickname))
  if (nickname) user.nickname = nickname
  const avatar = asOptionalText(pick(rawUser.avatar, source.p_avatar, source.avatar))
  if (avatar) user.avatar = avatar
  const email = asOptionalText(pick(rawUser.email, source.email))
  if (email) user.email = email
  if (hasValue(rawUser.updated_at)) user.updated_at = asText(rawUser.updated_at)

  return { reviews, themes, quotes, guides, settings, user }
}

/** 复盘拆分回旧 key 的格式，保证 ReviewPage 不改代码也能读到 */
export function splitLegacyReviews(reviews: ReviewEntry[]): {
  daily: Record<string, unknown>[]
  weekly: Record<string, unknown>[]
  monthly: Record<string, unknown>[]
  yearly: Record<string, unknown>[]
} {
  const daily: Record<string, unknown>[] = []
  const weekly: Record<string, unknown>[] = []
  const monthly: Record<string, unknown>[] = []
  const yearly: Record<string, unknown>[] = []
  for (const review of reviews) {
    const sections = review.sections || {}
    if (review.period_type === 'daily') {
      daily.push({
        date: review.period_key,
        done: sections.done || '',
        undone: sections.undone || '',
        tomorrow: sections.tomorrow || '',
        mood: review.mood ?? 3,
      })
    } else if (review.period_type === 'weekly') {
      weekly.push({ week: review.period_key, summary: sections.summary || '', next_week: sections.next || '' })
    } else if (review.period_type === 'monthly') {
      monthly.push({ month: review.period_key, summary: sections.summary || '', next_month: sections.next || '' })
    } else if (review.period_type === 'yearly') {
      yearly.push({ year: review.period_key, summary: sections.summary || '', next_year: sections.next || '' })
    }
  }
  return { daily, weekly, monthly, yearly }
}

/**
 * 导出载荷：
 * - format / schemaVersion 标识新结构
 * - v 继续写 5，旧版本导入新文件时仍能按 13 域读取（会忽略 extras）
 */
export function buildExportPayload(data: DomainData, extras: LocalExtras): Record<string, unknown> {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    v: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
    reviews: extras.reviews,
    themes: extras.themes,
    quotes: extras.quotes,
    guides: extras.guides,
    settings: extras.settings,
    user: extras.user,
  }
}

/** 兼容旧调用方：导出 LocalData 全量结构（13 域 + 6 实体） */
export function toLocalData(data: DomainData, extras: LocalExtras): LocalData {
  return { ...data, ...extras }
}
