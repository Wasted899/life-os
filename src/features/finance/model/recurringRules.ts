import type { Account, Recurring, Transaction, TransactionType } from '../../../core/types'

/**
 * 周期账单纯规则：应付日计算、期次 key、待生成期次、补记上限。
 * 组件与调度层只负责触发和渲染，所有判定都在这里，便于单测与复用。
 */

/** 单次补记上限：月度最多 12 期，年度最多 3 期 */
export const MONTHLY_CATCHUP_LIMIT = 12
export const YEARLY_CATCHUP_LIMIT = 3

/** 防御性扫描上限，避免非法数据导致死循环 */
const MAX_SCAN_PERIODS = 1200

export type RecurringCycle = 'monthly' | 'yearly'

export const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export interface NthWeekdayRule {
  /** 第几个，1..5；5 表示当月最后一个 */
  n: number
  /** 0=周日 .. 6=周六 */
  weekday: number
}

export interface ParsedDate {
  year: number
  month: number
  day: number
}

const pad2 = (value: number): string => String(value).padStart(2, '0')
const monthIndex = (year: number, month: number): number => year * 12 + (month - 1)

/** 某年某月（1-12）的天数，按 UTC 计算避免时区偏移 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 严格解析 YYYY-MM-DD（允许 ISO 时间字符串，只取日期部分） */
export function parseDate(value?: string | null): ParsedDate | null {
  if (typeof value !== 'string') return null
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** 解析 custom_period = 'nth:<n>:<weekday>'；不是该格式返回 null（按每月某日处理） */
export function parseNthPeriod(customPeriod?: string | null): NthWeekdayRule | null {
  if (!customPeriod) return null
  const matched = /^nth:([1-5]):([0-6])$/.exec(customPeriod.trim())
  return matched ? { n: Number(matched[1]), weekday: Number(matched[2]) } : null
}

export function formatNthPeriod(n: number, weekday: number): string {
  const safeN = Math.min(5, Math.max(1, Math.round(n)))
  const safeWeekday = Math.min(6, Math.max(0, Math.round(weekday)))
  return `nth:${safeN}:${safeWeekday}`
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * 当月第 n 个周几；n=5 且当月不存在第 5 个时，钳到当月最后一个该周几。
 * 例如 2026-02 只有 4 个周一，第 5 个周一 → 2026-02-23。
 */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const total = daysInMonth(year, month)
  const firstWeekday = weekdayOf(year, month, 1)
  const offset = (weekday - firstWeekday + 7) % 7
  const raw = 1 + offset + (Math.max(1, n) - 1) * 7
  if (raw <= total) return raw
  const lastWeekday = weekdayOf(year, month, total)
  return total - ((lastWeekday - weekday + 7) % 7)
}

/** 年度账单的月份锚点：取 start_date 的月份，不新增字段 */
export function anchorMonthOf(startDate?: string | null): number {
  return parseDate(startDate)?.month ?? 1
}

type DueRule = Pick<Recurring, 'cycle' | 'day' | 'start_date' | 'custom_period'>

/** 某期的应付日（月末自动钳制到当月最后一天 / 第 n 个周几自动钳制） */
export function dueDateFor(rule: DueRule, year: number, month: number): string {
  const nth = parseNthPeriod(rule.custom_period)
  if (nth) {
    const day = nthWeekdayOfMonth(year, month, nth.weekday, nth.n)
    return formatDate(year, month, day)
  }
  const total = daysInMonth(year, month)
  const day = Math.min(Math.max(1, Math.round(rule.day || 1)), total)
  return formatDate(year, month, day)
}

/** 期次 key：月度 YYYY-MM，年度 YYYY（用于幂等 id） */
export function periodKeyOf(cycle: RecurringCycle, year: number, month: number): string {
  return cycle === 'yearly' ? String(year) : `${year}-${pad2(month)}`
}

/** 自动生成流水的确定性 id：rec_<recurringId>_<periodKey> */
export function recurringPostingId(recurringId: string, periodKey: string): string {
  return `rec_${recurringId}_${periodKey}`
}

type PeriodRule = Pick<Recurring, 'cycle' | 'start_date'>

/** 日期所在期次序号；非法日期返回 null */
export function periodIndexOf(rule: PeriodRule, value?: string | null): number | null {
  const parsed = parseDate(value)
  if (!parsed) return null
  return rule.cycle === 'yearly' ? parsed.year : monthIndex(parsed.year, parsed.month)
}

export interface PeriodPoint {
  year: number
  month: number
}

/** 期次序号 → 年月（年度按 start_date 的月份锚点） */
export function periodAt(rule: PeriodRule, index: number): PeriodPoint {
  if (rule.cycle === 'yearly') return { year: index, month: anchorMonthOf(rule.start_date) }
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** 期次序号 → 应付日 */
export function dueDateAt(rule: DueRule, index: number): string {
  const point = periodAt(rule, index)
  return dueDateFor(rule, point.year, point.month)
}

function indexFromPeriodKey(rule: PeriodRule, key: string): number | null {
  if (rule.cycle === 'yearly') {
    if (!/^\d{4}$/.test(key)) return null
    return Number(key)
  }
  const matched = /^(\d{4})-(\d{2})$/.exec(key)
  if (!matched) return null
  const month = Number(matched[2])
  if (month < 1 || month > 12) return null
  return monthIndex(Number(matched[1]), month)
}

/** 已生成流水的期次序号（只认确定性 id 前缀，避免把用户手记流水算进来） */
function generatedPeriodIndexes(recurring: Recurring, transactions: Transaction[]): number[] {
  const prefix = `rec_${recurring.id}_`
  const result: number[] = []
  for (const tx of transactions) {
    if (typeof tx.id !== 'string' || !tx.id.startsWith(prefix)) continue
    const index = indexFromPeriodKey(recurring, tx.id.slice(prefix.length))
    if (index !== null) result.push(index)
  }
  return result
}

/**
 * 账户三级兜底：account_id → 账户名精确匹配 → 第一个账户。
 * 没有任何账户时返回 null，由调度层跳过并给出「缺少账户」提示。
 */
export function resolveRecurringAccount(
  rule: Pick<Recurring, 'account' | 'account_id'>,
  accounts: Account[],
): Account | null {
  if (rule.account_id) {
    const byId = accounts.find((account) => account.id === rule.account_id)
    if (byId) return byId
  }
  if (rule.account) {
    const byName = accounts.find((account) => account.name === rule.account)
    if (byName) return byName
  }
  return accounts.length > 0 ? accounts[0] : null
}

export interface RecurringPostingPayload {
  id: string
  recurring_id: string
  date: string
  type: TransactionType
  category: string
  amount: number
  account: string
  account_id: string
  note: string
}

export type RecurringWarningCode = 'missing-account' | 'catchup-limited'

export interface RecurringWarning {
  recurringId: string
  name: string
  code: RecurringWarningCode
  message: string
}

export interface RecurringNextDatePatch {
  id: string
  next_date: string
}

export interface RecurringPlan {
  creates: RecurringPostingPayload[]
  nextDates: RecurringNextDatePatch[]
  warnings: RecurringWarning[]
}

export interface RecurringPlanInput {
  recurrings: Recurring[]
  transactions: Transaction[]
  accounts: Account[]
  /** YYYY-MM-DD */
  today: string
}

/**
 * 计算本次需要补记的周期流水。
 *
 * 游标规则：next_date 与「已生成流水的最大期次 + 1」取较大者作为起点，
 * 因此删除已生成流水后不会复活，云端已有而本地缺 next_date 时也不会重复生成。
 */
export function planRecurringPostings(input: RecurringPlanInput): RecurringPlan {
  const plan: RecurringPlan = { creates: [], nextDates: [], warnings: [] }
  const today = parseDate(input.today)
  if (!today) return plan

  const todayIndex = (rule: PeriodRule): number =>
    rule.cycle === 'yearly' ? today.year : monthIndex(today.year, today.month)
  const existingIds = new Set(input.transactions.map((tx) => tx.id))

  for (const recurring of input.recurrings) {
    if (recurring.paused) continue

    const startIndex = periodIndexOf(recurring, recurring.start_date)
    if (startIndex === null) continue

    const account = resolveRecurringAccount(recurring, input.accounts)
    if (!account) {
      plan.warnings.push({
        recurringId: recurring.id,
        name: recurring.name,
        code: 'missing-account',
        message: '缺少账户，已跳过自动生成',
      })
      continue
    }

    const limit = recurring.cycle === 'yearly' ? YEARLY_CATCHUP_LIMIT : MONTHLY_CATCHUP_LIMIT
    const endIndex = todayIndex(recurring)

    let anchorIndex = startIndex
    const cursorIndex = periodIndexOf(recurring, recurring.next_date)
    if (cursorIndex !== null) anchorIndex = Math.max(anchorIndex, cursorIndex)
    const generated = generatedPeriodIndexes(recurring, input.transactions)
    if (generated.length > 0) anchorIndex = Math.max(anchorIndex, Math.max(...generated) + 1)

    let produced = 0
    let stopIndex: number | null = null

    for (let index = anchorIndex; index <= endIndex; index += 1) {
      const due = dueDateAt(recurring, index)
      if (due < recurring.start_date) continue
      if (due > input.today) break

      const point = periodAt(recurring, index)
      const key = periodKeyOf(recurring.cycle, point.year, point.month)
      const id = recurringPostingId(recurring.id, key)
      if (existingIds.has(id)) continue

      if (produced >= limit) {
        stopIndex = index
        plan.warnings.push({
          recurringId: recurring.id,
          name: recurring.name,
          code: 'catchup-limited',
          message: `一次最多补记 ${limit} 期，剩余期次将在下次触发时继续`,
        })
        break
      }

      plan.creates.push({
        id,
        recurring_id: recurring.id,
        date: due,
        type: recurring.type === 'income' ? 'income' : 'expense',
        category: recurring.category,
        amount: recurring.amount,
        account: account.name,
        account_id: account.id,
        note: recurring.name,
      })
      existingIds.add(id)
      produced += 1
    }

    let nextIndex: number
    if (stopIndex !== null) {
      nextIndex = stopIndex
    } else {
      nextIndex = Math.max(anchorIndex, endIndex)
      let guard = 0
      while (guard < MAX_SCAN_PERIODS) {
        guard += 1
        const due = dueDateAt(recurring, nextIndex)
        if (due < recurring.start_date) {
          nextIndex += 1
          continue
        }
        if (due <= input.today) {
          nextIndex += 1
          continue
        }
        break
      }
    }

    let guard = 0
    while (guard < MAX_SCAN_PERIODS && dueDateAt(recurring, nextIndex) < recurring.start_date) {
      guard += 1
      nextIndex += 1
    }

    const nextDate = dueDateAt(recurring, nextIndex)
    if (nextDate !== recurring.next_date) {
      plan.nextDates.push({ id: recurring.id, next_date: nextDate })
    }
  }

  return plan
}

/** 从某天起（含当天）的第一个应付日；用于暂停恢复与「下次生成日」展示 */
export function nextDueOnOrAfter(
  rule: Pick<Recurring, 'cycle' | 'day' | 'start_date' | 'custom_period' | 'next_date'>,
  date: string,
): string {
  const startIndex = periodIndexOf(rule, rule.start_date)
  const parsed = parseDate(date)
  if (startIndex === null) return rule.next_date || rule.start_date || date

  let index = startIndex
  if (parsed) {
    const dateIndex = rule.cycle === 'yearly' ? parsed.year : monthIndex(parsed.year, parsed.month)
    index = Math.max(index, dateIndex)
  }

  let guard = 0
  while (guard < MAX_SCAN_PERIODS) {
    guard += 1
    const due = dueDateAt(rule, index)
    if (due >= rule.start_date && (!parsed || due >= date)) return due
    index += 1
  }
  return rule.next_date || rule.start_date || date
}

/** 规则的中文描述，用于列表展示 */
export function recurringScheduleLabel(rule: DueRule): string {
  const nth = parseNthPeriod(rule.custom_period)
  const prefix = rule.cycle === 'yearly' ? '每年' : '每月'
  if (nth) return `${prefix}第 ${nth.n} 个${WEEKDAY_LABELS[nth.weekday]}`
  if (rule.cycle === 'yearly') return `每年 ${anchorMonthOf(rule.start_date)} 月 ${rule.day} 日`
  return `每月 ${rule.day} 日`
}
