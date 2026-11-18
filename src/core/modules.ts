/**
 * 功能模块开关的唯一权威源（纯逻辑，不依赖 React / 页面 / DataContext）。
 *
 * 约束：
 * - 只负责「哪些模块可被关闭、开关值如何归一、导航如何过滤、路径归属哪个模块」
 * - 只读写 p_disabled 一个旧 key；绝不触碰任何领域数据 key
 * - 不 import context/** 或 features/**，避免反向依赖（见 architecture.test.ts）
 */

import type { ModuleId } from './types'
import type { NavGroup } from './nav'
import { MODULE_PATHS } from './nav'

export type ModuleMeta = {
  label: string
  icon: string
  /** 是否允许在设置页关闭 */
  disableable: boolean
}

/** 模块元数据：Record<ModuleId, ...> 保证新增 ModuleId 时编译期必须补齐 */
export const MODULE_META: Record<ModuleId, ModuleMeta> = {
  today: { label: '今日', icon: '📅', disableable: false },
  todos: { label: '待办清单', icon: '✅', disableable: true },
  goals: { label: '目标管理', icon: '🎯', disableable: true },
  habits: { label: '习惯打卡', icon: '🔥', disableable: true },
  importantDays: { label: '重要日子', icon: '⏰', disableable: true },
  calendar: { label: '日历', icon: '📆', disableable: true },
  timeStats: { label: '时间统计', icon: '⏱️', disableable: true },
  pomodoro: { label: '番茄钟', icon: '🍅', disableable: true },
  timer: { label: '计时器', icon: '⏳', disableable: true },
  review: { label: '复盘', icon: '📝', disableable: true },
  memos: { label: '备忘录', icon: '📝', disableable: true },
  finance: { label: '记账', icon: '💰', disableable: true },
  guide: { label: '指南', icon: '📚', disableable: true },
  settings: { label: '设置', icon: '⚙️', disableable: false },
}

/** 设置页展示顺序；today / settings 不在开关列表里 */
export const MODULE_ORDER: readonly ModuleId[] = [
  'today',
  'todos',
  'goals',
  'habits',
  'importantDays',
  'calendar',
  'timeStats',
  'pomodoro',
  'timer',
  'review',
  'memos',
  'finance',
  'guide',
  'settings',
]

export const CONFIGURABLE_MODULES: readonly ModuleId[] =
  MODULE_ORDER.filter(id => MODULE_META[id].disableable)

export const DISABLED_MODULES_KEY = 'p_disabled'
export const MODULE_CHANGED_EVENT = 'planner:modules-changed'

/** 历史模块 id → 现行 ModuleId（只用于兼容已存入 p_disabled 的旧值） */
export const LEGACY_MODULE_ID_MAP: Readonly<Record<string, ModuleId>> = {
  days: 'importantDays',
  time: 'timeStats',
}

const MODULE_INDEX: Readonly<Record<ModuleId, number>> = MODULE_ORDER.reduce(
  (acc, id, index) => ({ ...acc, [id]: index }),
  {} as Record<ModuleId, number>,
)

export const isModuleId = (value: unknown): value is ModuleId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(MODULE_META, value)

/**
 * 开关值归一：旧 id 映射 → 丢弃非法值 → 去重 → 剔除不可关闭模块 → 按固定顺序排序。
 * 结果稳定，保证幂等与 useSyncExternalStore 的快照可比较。
 */
export function normalizeDisabledModules(raw: unknown): ModuleId[] {
  if (!Array.isArray(raw)) return []
  const mapped: ModuleId[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const next = LEGACY_MODULE_ID_MAP[value] ?? value
    if (isModuleId(next)) mapped.push(next)
  }
  const unique = Array.from(new Set(mapped))
  return unique
    .filter(id => MODULE_META[id].disableable)
    .sort((a, b) => MODULE_INDEX[a] - MODULE_INDEX[b])
}

let cachedRaw: string | null = null
let cachedIds: ModuleId[] = []

/**
 * 读取开关（裸 JSON 数组，兼容旧页面写入格式）。
 * 用原始字符串做缓存，保证同一份存储返回同一个数组引用：
 * useSyncExternalStore 要求快照稳定，否则会无限重渲染。
 */
export function readDisabledModules(): ModuleId[] {
  if (typeof window === 'undefined') return cachedIds
  let rawText = ''
  try {
    rawText = window.localStorage.getItem(DISABLED_MODULES_KEY) ?? ''
  } catch {
    return cachedIds
  }
  if (rawText === cachedRaw) return cachedIds

  cachedRaw = rawText
  let parsed: unknown = []
  try {
    parsed = rawText ? JSON.parse(rawText) : []
  } catch {
    parsed = []
  }
  cachedIds = normalizeDisabledModules(parsed)
  return cachedIds
}

/**
 * 写入开关：只写 p_disabled，并派发同标签页事件。
 * 跨标签页由浏览器原生 storage 事件负责。
 */
export function writeDisabledModules(ids: readonly ModuleId[]): ModuleId[] {
  const next = normalizeDisabledModules(ids)
  const serialized = JSON.stringify(next)
  try {
    window.localStorage.setItem(DISABLED_MODULES_KEY, serialized)
  } catch {
    // 配额满 / 隐私模式：开关不生效但不阻断页面
  }
  cachedRaw = serialized
  cachedIds = next
  try {
    window.dispatchEvent(new Event(MODULE_CHANGED_EVENT))
  } catch {
    // 非浏览器环境忽略
  }
  return next
}

/**
 * 启动时把历史值写回归一结果（幂等）。
 * 只改 p_disabled；没有旧值或已经归一过时什么都不做。
 */
export function migrateDisabledModulesStorage(): ModuleId[] {
  if (typeof window === 'undefined') return cachedIds
  let rawText: string | null = null
  try {
    rawText = window.localStorage.getItem(DISABLED_MODULES_KEY)
  } catch {
    return cachedIds
  }
  if (rawText === null) return readDisabledModules()

  let parsed: unknown = []
  try {
    parsed = JSON.parse(rawText)
  } catch {
    parsed = []
  }
  const normalized = normalizeDisabledModules(parsed)
  const serialized = JSON.stringify(normalized)
  if (serialized !== rawText) writeDisabledModules(normalized)
  return normalized
}

export function isModuleDisabled(
  module: ModuleId,
  disabled: readonly ModuleId[] = readDisabledModules(),
): boolean {
  return disabled.includes(module)
}

/** 过滤侧栏导航：组内条目全部被关闭时，连组标题一起不渲染 */
export function visibleNavGroups(
  groups: readonly NavGroup[],
  disabled: readonly ModuleId[],
): NavGroup[] {
  const hidden = new Set(disabled)
  return groups
    .map(group => ({ ...group, items: group.items.filter(item => !hidden.has(item.module)) }))
    .filter(group => group.items.length > 0)
}

/** 路径 → 模块。按路径长度倒序匹配，保证 /timer 不会被 /time 抢走 */
const PATHS_BY_LENGTH: ReadonlyArray<[string, ModuleId]> = (
  Object.entries(MODULE_PATHS) as Array<[ModuleId, string]>
)
  .map(([module, path]) => [path, module] as [string, ModuleId])
  .sort((a, b) => b[0].length - a[0].length)

export function moduleForPath(pathname: string): ModuleId | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  for (const [base, module] of PATHS_BY_LENGTH) {
    if (path === base) return module
    if (base !== '/' && path.startsWith(`${base}/`)) return module
  }
  return null
}
