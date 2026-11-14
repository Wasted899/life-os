/**
 * 习惯排期与进度纯逻辑（M1-13）
 *
 * 设计约束（已拍板，勿改）：
 * 1. frequency 与 target_count / target_period 正交：
 *    - frequency 决定"哪些天该做"（habitDue）
 *    - target_count / target_period 只决定"进度条几格、按什么周期统计"
 *    - 目标次数不参与"是否生成待办"的判断
 * 2. 周首固定为周一，周期 key 用 ISO 周 `YYYY-Www`；月周期用 `YYYY-MM`。
 * 3. monthly_day 强制按自然月统计，目标次数固定 1。
 * 4. 旧数据缺失 target_count 时，分母回落到"该频率在本周期内应做的天数"。
 * 5. 进度分子一律以 check_dates 为准（真实打卡事实），不读待办完成状态。
 */
import dayjs, { type Dayjs } from 'dayjs'
import type { Habit } from '../../core/types'

export type HabitPeriod = 'week' | 'month'

export interface HabitPeriodRange {
  period: HabitPeriod
  /** YYYY-MM-DD，含 */
  start: string
  /** YYYY-MM-DD，含 */
  end: string
  /** week: YYYY-Www（ISO 周，周一起算）；month: YYYY-MM */
  key: string
}

export interface HabitProgress {
  total: number
  done: number
  /** 进度条实际涂色格数（不超过 total） */
  capped: number
  achieved: boolean
  remaining: number
  range: HabitPeriodRange
}

export interface HabitTodoPlanItem {
  habitId: string
  title: string
  categoryId: string
  /** YYYY-MM-DD */
  dueDate: string
}

/** 表单可提交的原始配置（target_count 允许空串表示"自动"） */
export interface HabitConfigInput {
  frequency: string
  custom_days?: number[]
  target_count?: number | ''
  target_period?: HabitPeriod | ''
  monthly_day?: number | ''
}

const DATE_FORMAT = 'YYYY-MM-DD'

export const clampMonthlyDay = (value?: number): number => {
  const day = Math.floor(Number(value))
  if (!Number.isFinite(day)) return 1
  return Math.min(31, Math.max(1, day))
}

/** 自定义星期去重、排序；空列表回落到周一（与 migrate 的 [1] 保持一致） */
export const effectiveCustomDays = (days?: number[]): number[] => {
  const valid = Array.from(new Set((days || []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)))
  const sorted = valid.sort((a, b) => a - b)
  return sorted.length ? sorted : [1]
}

/**
 * 某天是否该做该习惯。
 * 修复点：monthly_day 不再落到 `return true`（旧实现导致每月某日习惯每天生成待办）。
 */
export const habitDue = (
  habit: Pick<Habit, 'frequency' | 'custom_days' | 'monthly_day'>,
  date: string | Dayjs,
): boolean => {
  const d = typeof date === 'string' ? dayjs(date) : date
  switch (habit.frequency) {
    case 'daily':
      return true
    case 'weekdays':
      return d.day() >= 1 && d.day() <= 5
    case 'weekends':
      return d.day() === 0 || d.day() === 6
    case 'custom':
      return effectiveCustomDays(habit.custom_days).includes(d.day())
    case 'monthly_day':
      return d.date() === clampMonthlyDay(habit.monthly_day)
    default:
      return true
  }
}

/** monthly_day 强制月周期；其余看 target_period，缺省按周 */
export const resolvePeriod = (habit: Pick<Habit, 'frequency' | 'target_period'>): HabitPeriod =>
  habit.frequency === 'monthly_day' ? 'month' : habit.target_period === 'month' ? 'month' : 'week'

/** ISO 周：周一开始，跨年按 ISO 8601（如 2027-01-01 属于 2026-W53） */
export const isoWeekKey = (date: string | Dayjs): string => {
  const value = typeof date === 'string' ? dayjs(date) : date
  const target = new Date(Date.UTC(value.year(), value.month(), value.date()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** 周期区间：周 = 本周一~本周日；月 = 当月 1 日~月末 */
export const periodRange = (habit: Pick<Habit, 'frequency' | 'target_period'>, date: string | Dayjs): HabitPeriodRange => {
  const value = typeof date === 'string' ? dayjs(date) : date
  if (resolvePeriod(habit) === 'month') {
    return {
      period: 'month',
      start: value.startOf('month').format(DATE_FORMAT),
      end: value.endOf('month').format(DATE_FORMAT),
      key: value.format('YYYY-MM'),
    }
  }
  const monday = value.subtract((value.day() + 6) % 7, 'day')
  return {
    period: 'week',
    start: monday.format(DATE_FORMAT),
    end: monday.add(6, 'day').format(DATE_FORMAT),
    key: isoWeekKey(value),
  }
}

/** 统计区间内"该做"的天数，用于自动分母 */
export const countDueDays = (habit: Pick<Habit, 'frequency' | 'custom_days' | 'monthly_day' | 'target_period'>, range: HabitPeriodRange): number => {
  let count = 0
  const end = dayjs(range.end)
  let cursor = dayjs(range.start)
  while (!cursor.isAfter(end)) {
    if (habitDue(habit, cursor)) count += 1
    cursor = cursor.add(1, 'day')
  }
  return count
}

/** 合法目标次数：正整数才认，0/负数/NaN 一律视为未设置 */
export const validTargetCount = (value?: number): number | undefined => {
  const count = Number(value)
  if (!Number.isFinite(count) || count < 1) return undefined
  return Math.floor(count)
}

/**
 * 进度条分母（总格数）。
 * - 显式 target_count 优先，但不超过本周期实际可做的天数（防御历史脏数据）
 * - 缺失时回落到本周期应做天数（旧习惯自动模式）
 * - monthly_day 固定 1
 */
export const maxTargetFor = (habit: Habit, date: string | Dayjs): number => {
  const possible = Math.max(1, countDueDays(habit, periodRange(habit, date)))
  if (habit.frequency === 'monthly_day') return 1
  const explicit = validTargetCount(habit.target_count)
  return explicit ? Math.min(explicit, possible) : possible
}

/** 进度：分子 = 本周期内的 check_dates 条数 */
export const progressOf = (habit: Habit, date: string | Dayjs): HabitProgress => {
  const range = periodRange(habit, date)
  const total = maxTargetFor(habit, date)
  const done = habit.check_dates.filter(day => day >= range.start && day <= range.end).length
  return {
    total,
    done,
    capped: Math.min(done, total),
    achieved: done >= total,
    remaining: Math.max(0, total - done),
    range,
  }
}

/**
 * 习惯待办生成计划：范围 `[周期起点, today + futureDays]`。
 * 只输出"该做且尚未被调用方过滤"的目标，调用方负责与现有待办 diff 去重。
 */
export const buildHabitTodoPlan = (
  habits: Habit[],
  today: string,
  futureDays = 6,
): HabitTodoPlanItem[] => {
  const end = dayjs(today).add(futureDays, 'day')
  const seen = new Set<string>()
  const plan: HabitTodoPlanItem[] = []
  habits.forEach(habit => {
    let cursor = dayjs(periodRange(habit, today).start)
    while (!cursor.isAfter(end)) {
      const dueDate = cursor.format(DATE_FORMAT)
      const key = `${habit.id}|${dueDate}`
      if (!seen.has(key) && habitDue(habit, cursor)) {
        seen.add(key)
        plan.push({
          habitId: habit.id,
          title: habit.title,
          categoryId: habit.category_id || '',
          dueDate,
        })
      }
      cursor = cursor.add(1, 'day')
    }
  })
  return plan
}

export const frequencyLabel = (frequency: string): string => {
  if (frequency === 'daily') return '每天'
  if (frequency === 'weekdays') return '工作日'
  if (frequency === 'weekends') return '周末'
  if (frequency === 'custom') return '自定义星期'
  if (frequency === 'monthly_day') return '每月某日'
  return frequency
}

/** 每周最多可做次数（用于表单非法组合提示） */
export const weeklyCapacity = (frequency: string, customDays?: number[]): number => {
  if (frequency === 'daily') return 7
  if (frequency === 'weekdays') return 5
  if (frequency === 'weekends') return 2
  if (frequency === 'custom') return effectiveCustomDays(customDays).length
  if (frequency === 'monthly_day') return 1
  return 7
}

/**
 * 表单校验：返回错误文案，合法返回 null。
 * 只拦"语义上不可能"的组合，不拦"低频目标"（如每天习惯每周 3 次是合法的）。
 */
export const validateHabitConfig = (input: HabitConfigInput): string | null => {
  if (input.frequency === 'monthly_day') {
    if (input.target_period && input.target_period !== 'month') return '「每月某日」只能按自然月统计'
    if (input.target_count !== undefined && input.target_count !== '' && Number(input.target_count) !== 1) {
      return '「每月某日」的目标次数固定为 1'
    }
    const day = Number(input.monthly_day)
    if (!Number.isInteger(day) || day < 1 || day > 31) return '请选择 1-31 之间的日期'
    return null
  }
  if (input.target_count === undefined || input.target_count === '') return null
  const count = Number(input.target_count)
  if (!Number.isInteger(count) || count < 1) return '目标次数必须是大于 0 的整数'
  if ((input.target_period || 'week') === 'week') {
    const capacity = weeklyCapacity(input.frequency, input.custom_days)
    if (count > capacity) return `${frequencyLabel(input.frequency)}每周最多 ${capacity} 次`
  }
  return null
}
