/**
 * 目标树纯逻辑（M1-17）
 *
 * 已拍板约束：
 * 1. 父目标进度 = 直接子目标等权平均；汇总值只用于展示，不回写 progress
 * 2. 层级强制相邻：year → month → week → day
 * 3. 子目标周期必须完整落在父目标周期内
 * 4. 有子节点的目标禁止删除
 * 5. 默认只看当前周期、默认展开一层
 * 6. 旧目标缺 period_key：按 start_date 推导，推不出用当前周期
 *
 * 复杂度：
 * - buildGoalIndex 单次 O(n log n)（排序），之后父/子/层级查找均为 O(1)
 * - 汇总用一次 DFS，环检测用 visiting 标记，环上节点回落自身 progress
 */
import dayjs, { type Dayjs } from 'dayjs'
import type { Goal, GoalLevel } from '../../core/types'
import { isoWeekKey } from '../habits/habitSchedule'

export const GOAL_LEVELS: readonly GoalLevel[] = ['year', 'month', 'week', 'day']

const DATE_FORMAT = 'YYYY-MM-DD'

export const isGoalLevel = (value: unknown): value is GoalLevel =>
  value === 'year' || value === 'month' || value === 'week' || value === 'day'

/** 旧 type 别名 → 新 level */
const LEGACY_LEVELS: Record<string, GoalLevel> = {
  yearly: 'year',
  monthly: 'month',
  weekly: 'week',
  daily: 'day',
  year: 'year',
  month: 'month',
  week: 'week',
  day: 'day',
}

export const goalLevelOf = (goal: Pick<Goal, 'level' | 'type'>): GoalLevel => {
  if (isGoalLevel(goal.level)) return goal.level
  return LEGACY_LEVELS[String(goal.type || '')] || 'year'
}

/** 旧 UI 仍读 type，写入时保持同步；沿用旧枚举值（day → daily） */
export const legacyTypeOfLevel = (level: GoalLevel): string =>
  level === 'year' ? 'yearly' : level === 'month' ? 'monthly' : level === 'week' ? 'weekly' : 'daily'

export const goalLevelLabel = (level: GoalLevel): string =>
  level === 'year' ? '年' : level === 'month' ? '月' : level === 'week' ? '周' : '日'

export const goalParentLevel = (level: GoalLevel): GoalLevel | null => {
  const index = GOAL_LEVELS.indexOf(level)
  return index > 0 ? GOAL_LEVELS[index - 1] : null
}

export const goalChildLevel = (level: GoalLevel): GoalLevel | null => {
  const index = GOAL_LEVELS.indexOf(level)
  return index >= 0 && index < GOAL_LEVELS.length - 1 ? GOAL_LEVELS[index + 1] : null
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** ISO 周（周一起算），与习惯模块保持一致 */
export const goalWeekKey = isoWeekKey

const mondayOfIsoWeek = (key: string): Dayjs | null => {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(key.trim())
  if (!match) return null
  const year = Number(match[1])
  const week = Number(match[2])
  if (week < 1 || week > 53) return null
  const jan4 = dayjs(`${year}-01-04`)
  const monday = jan4.subtract((jan4.day() + 6) % 7, 'day').add((week - 1) * 7, 'day')
  // 验证该周确实属于目标年份（排除 52 周年份的 W53）
  if (isoWeekKey(monday) !== `${year}-W${pad2(week)}`) return null
  return monday
}

/** 把任意日期格式化为该层级的 period_key；周首周一 */
export const periodKeyFor = (level: GoalLevel, date: string | Dayjs): string => {
  const value = typeof date === 'string' ? dayjs(date) : date
  if (level === 'year') return value.format('YYYY')
  if (level === 'month') return value.format('YYYY-MM')
  if (level === 'week') return isoWeekKey(value)
  return value.format(DATE_FORMAT)
}

/** period_key 规范化为 YYYY / YYYY-MM / YYYY-Www / YYYY-MM-DD；非法返回 null */
export const normalizePeriodKey = (level: GoalLevel, raw: unknown): string | null => {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return null
  if (level === 'year') return /^\d{4}$/.test(text) ? text : null
  if (level === 'month') {
    const match = /^(\d{4})-(\d{1,2})$/.exec(text)
    if (!match) return null
    const month = Number(match[2])
    return month >= 1 && month <= 12 ? `${match[1]}-${pad2(month)}` : null
  }
  if (level === 'week') {
    const match = /^(\d{4})-W(\d{1,2})$/.exec(text)
    if (!match) return null
    const key = `${match[1]}-W${pad2(Number(match[2]))}`
    return mondayOfIsoWeek(key) ? key : null
  }
  return dayjs(text).isValid() && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

/** 从 period_key 反推该周期的起始日期，用于日期选择器回填 */
export const dateOfPeriodKey = (level: GoalLevel, key: string): string => {
  if (level === 'week') {
    const monday = mondayOfIsoWeek(key)
    if (monday) return monday.format(DATE_FORMAT)
  }
  if (level === 'year' && /^\d{4}$/.test(key)) return `${key}-01-01`
  if (level === 'month' && /^\d{4}-\d{2}$/.test(key)) return `${key}-01`
  if (level === 'day' && dayjs(key).isValid()) return key
  return dayjs().format(DATE_FORMAT)
}

export interface GoalPeriodBounds {
  start: string
  end: string
}

export const periodBounds = (level: GoalLevel, key: string): GoalPeriodBounds => {
  if (level === 'year') {
    const year = /^\d{4}$/.test(key) ? key : dayjs().format('YYYY')
    return { start: `${year}-01-01`, end: `${year}-12-31` }
  }
  if (level === 'month') {
    const start = dayjs(`${key}-01`)
    const base = start.isValid() ? start : dayjs().startOf('month')
    return { start: base.format(DATE_FORMAT), end: base.endOf('month').format(DATE_FORMAT) }
  }
  if (level === 'week') {
    const monday = mondayOfIsoWeek(key) || dayjs().subtract((dayjs().day() + 6) % 7, 'day')
    return { start: monday.format(DATE_FORMAT), end: monday.add(6, 'day').format(DATE_FORMAT) }
  }
  const date = dayjs(key)
  const value = date.isValid() ? date : dayjs()
  return { start: value.format(DATE_FORMAT), end: value.format(DATE_FORMAT) }
}

export const shiftPeriodKey = (level: GoalLevel, key: string, delta: number): string => {
  if (level === 'year') {
    const year = Number(key)
    return String((Number.isFinite(year) ? year : dayjs().year()) + delta)
  }
  if (level === 'month') {
    const base = dayjs(`${key}-01`)
    return (base.isValid() ? base : dayjs()).add(delta, 'month').format('YYYY-MM')
  }
  if (level === 'week') {
    const monday = mondayOfIsoWeek(key) || dayjs().subtract((dayjs().day() + 6) % 7, 'day')
    return isoWeekKey(monday.add(delta * 7, 'day'))
  }
  const base = dayjs(key)
  return (base.isValid() ? base : dayjs()).add(delta, 'day').format(DATE_FORMAT)
}

export const periodLabel = (level: GoalLevel, key: string): string => {
  if (level === 'year') return `${key} 年`
  if (level === 'month') {
    const [year, month] = key.split('-')
    return `${year} 年 ${Number(month)} 月`
  }
  if (level === 'week') return `${key} 周`
  return key
}

/** 子周期是否完整落在父周期内（字符串按 ISO 日期可直接比较） */
export const periodContains = (
  parentLevel: GoalLevel,
  parentKey: string,
  childLevel: GoalLevel,
  childKey: string,
): boolean => {
  const parent = periodBounds(parentLevel, parentKey)
  const child = periodBounds(childLevel, childKey)
  return child.start >= parent.start && child.end <= parent.end
}

/** 目标实际用于筛选/校验的 period_key：非法或缺失时按 start_date → 今天推导 */
export const goalPeriodKeyOf = (goal: Goal, fallbackDate: string | Dayjs = dayjs()): string => {
  const level = goalLevelOf(goal)
  const normalized = normalizePeriodKey(level, goal.period_key)
  if (normalized) return normalized
  if (goal.start_date) {
    const start = dayjs(goal.start_date)
    if (start.isValid()) return periodKeyFor(level, start)
  }
  return periodKeyFor(level, fallbackDate)
}

export interface GoalIndex {
  byId: Map<string, Goal>
  /** key '' 为根节点 */
  childrenOf: Map<string, Goal[]>
  byLevel: Record<GoalLevel, Goal[]>
  /** 展示用汇总进度；有子节点为等权平均，叶子为自身 progress */
  rolledProgress: Map<string, number>
  /** 成环的节点（仅用于诊断/测试；migrate 会提前解绑） */
  cycles: Set<string>
}

const clampProgress = (value: number): number => Math.min(100, Math.max(0, Math.round(Number(value) || 0)))

const compareGoals = (a: Goal, b: Goal): number => {
  const ak = a.period_key || ''
  const bk = b.period_key || ''
  if (ak !== bk) return ak.localeCompare(bk)
  return a.title.localeCompare(b.title, 'zh')
}

/**
 * 一次性建索引：
 * - byId / childrenOf / byLevel 均为 Map，渲染期 O(1) 查找
 * - rolledProgress 用带 visiting 标记的 DFS，环不会死循环
 */
export const buildGoalIndex = (goals: Goal[]): GoalIndex => {
  const byId = new Map<string, Goal>()
  goals.forEach(goal => byId.set(goal.id, goal))

  const byLevel: Record<GoalLevel, Goal[]> = { year: [], month: [], week: [], day: [] }
  const childrenOf = new Map<string, Goal[]>()
  childrenOf.set('', [])

  goals.forEach(goal => {
    byLevel[goalLevelOf(goal)].push(goal)
    const parentId = goal.parent_id && goal.parent_id !== goal.id && byId.has(goal.parent_id) ? goal.parent_id : ''
    const bucket = childrenOf.get(parentId)
    if (bucket) bucket.push(goal)
    else childrenOf.set(parentId, [goal])
  })

  byLevel.year.sort(compareGoals)
  byLevel.month.sort(compareGoals)
  byLevel.week.sort(compareGoals)
  byLevel.day.sort(compareGoals)
  childrenOf.forEach(bucket => bucket.sort(compareGoals))

  const rolledProgress = new Map<string, number>()
  const cycles = new Set<string>()
  const state = new Map<string, 'visiting' | 'done'>()

  const calc = (id: string): number => {
    const status = state.get(id)
    if (status === 'done') return rolledProgress.get(id) || 0
    if (status === 'visiting') {
      cycles.add(id)
      return clampProgress(byId.get(id)?.progress || 0)
    }
    state.set(id, 'visiting')
    const children = childrenOf.get(id) || []
    const value = children.length
      ? clampProgress(children.reduce((sum, child) => sum + calc(child.id), 0) / children.length)
      : clampProgress(byId.get(id)?.progress || 0)
    state.set(id, 'done')
    rolledProgress.set(id, value)
    return value
  }

  goals.forEach(goal => calc(goal.id))

  return { byId, childrenOf, byLevel, rolledProgress, cycles }
}

export const childrenOfGoal = (index: GoalIndex, id: string): Goal[] => index.childrenOf.get(id) || []

/** 父目标校验：层级必须相邻、周期必须包含；返回错误文案（含父周期） */
export const goalParentError = (
  childLevel: GoalLevel,
  childPeriodKey: string,
  parent: Goal,
): string | null => {
  const parentLevel = goalLevelOf(parent)
  const expected = goalParentLevel(childLevel)
  if (!expected || parentLevel !== expected) {
    return `目标层级必须相邻：${goalLevelLabel(childLevel)}目标的父目标只能是${expected ? `${goalLevelLabel(expected)}目标` : '—'}`
  }
  const parentKey = goalPeriodKeyOf(parent)
  if (!periodContains(parentLevel, parentKey, childLevel, childPeriodKey)) {
    return `${goalLevelLabel(childLevel)}目标必须落在其父${goalLevelLabel(parentLevel)}目标的周期内（父周期：${periodLabel(parentLevel, parentKey)}）`
  }
  return null
}

export interface GoalForestRepair {
  goals: Goal[]
  changed: number
}

/**
 * 修复非法父子关系（migrate 冷启动/导入时执行）：
 * - 父不存在 / 自指 → 解绑
 * - 层级不相邻 → 解绑
 * - 成环 → 断开环上的边
 * 不修改 period_key / progress，避免破坏导入数据。
 */
export const repairGoalForest = (goals: Goal[]): GoalForestRepair => {
  const next = goals.map(goal => ({ ...goal }))
  const map = new Map(next.map(goal => [goal.id, goal]))
  let changed = 0

  next.forEach(goal => {
    if (!goal.parent_id) return
    const parent = map.get(goal.parent_id)
    if (!parent || parent.id === goal.id) {
      goal.parent_id = undefined
      changed += 1
      return
    }
    if (goalParentLevel(goalLevelOf(goal)) !== goalLevelOf(parent)) {
      goal.parent_id = undefined
      changed += 1
    }
  })

  next.forEach(goal => {
    const path = new Set<string>([goal.id])
    let current: Goal | undefined = goal
    while (current?.parent_id) {
      const parentId = current.parent_id
      if (path.has(parentId)) {
        current.parent_id = undefined
        changed += 1
        break
      }
      path.add(parentId)
      current = map.get(parentId)
    }
  })

  return { goals: next, changed }
}
