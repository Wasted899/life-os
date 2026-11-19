import dayjs from 'dayjs'
import type { ReviewPeriod } from './types'
import { isoWeekKey, monthKey, yearKey } from './periodKey'

/**
 * 复盘周期 key 的唯一实现（日 / 周 / 月 / 年）。
 *
 * 口径与全站一致：
 * - daily   YYYY-MM-DD
 * - weekly  YYYY-Www，周一为周首、ISO 8601（与 core/periodKey 同源）
 * - monthly YYYY-MM
 * - yearly  YYYY
 *
 * 本文件位于 core：migrate 做归一、页面做 URL 解析都复用它，禁止依赖 features。
 */

export const REVIEW_PERIODS: readonly ReviewPeriod[] = ['daily', 'weekly', 'monthly', 'yearly']

const pad2 = (value: number): string => String(value).padStart(2, '0')

const isValidDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1) return false
  const value = new Date(Date.UTC(year, month - 1, day))
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
}

/** ISO 周的第 1 天（周一），返回 YYYY-MM-DD */
export const mondayOfIsoWeek = (year: number, week: number): string => {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekday = jan4.getUTCDay() || 7
  const monday = new Date(jan4.getTime() - (weekday - 1) * 86_400_000 + (week - 1) * 7 * 86_400_000)
  return monday.toISOString().slice(0, 10)
}

/**
 * 把任意输入归一为合法周期 key；非法返回 null（调用方丢弃）。
 * 不合法包括：形状不对、日期不存在、ISO 周 53 在该年不存在。
 */
export function normalizeReviewKey(period: ReviewPeriod, raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  if (period === 'daily') {
    const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
    if (!matched) return null
    const year = Number(matched[1])
    const month = Number(matched[2])
    const day = Number(matched[3])
    if (!isValidDate(year, month, day)) return null
    return `${year}-${pad2(month)}-${pad2(day)}`
  }

  if (period === 'weekly') {
    const matched = /^(\d{4})-W(\d{1,2})$/i.exec(text)
    if (!matched) return null
    const year = Number(matched[1])
    const week = Number(matched[2])
    if (week < 1 || week > 53) return null
    const key = `${year}-W${pad2(week)}`
    // 用周一反算 ISO 周，剔除不存在的 W53
    return isoWeekKey(mondayOfIsoWeek(year, week)) === key ? key : null
  }

  if (period === 'monthly') {
    const matched = /^(\d{4})-(\d{1,2})$/.exec(text)
    if (!matched) return null
    const month = Number(matched[2])
    if (month < 1 || month > 12) return null
    return `${matched[1]}-${pad2(month)}`
  }

  const matched = /^(\d{4})$/.exec(text)
  return matched ? matched[1] : null
}

/** 任意日期 → 该日期所属周期的 key */
export function reviewKeyOfDate(period: ReviewPeriod, date: string): string | null {
  const value = dayjs(date)
  if (!value.isValid()) return null
  switch (period) {
    case 'weekly':
      return isoWeekKey(value)
    case 'monthly':
      return monthKey(value)
    case 'yearly':
      return yearKey(value)
    default:
      return value.format('YYYY-MM-DD')
  }
}

export interface ReviewRange {
  start: string
  end: string
}

/** 周期起止日期（含端点），入参必须是已归一的 key */
export function reviewRangeOf(period: ReviewPeriod, key: string): ReviewRange {
  if (period === 'daily') return { start: key, end: key }

  if (period === 'weekly') {
    const year = Number(key.slice(0, 4))
    const week = Number(key.slice(6))
    const start = mondayOfIsoWeek(year, week)
    const end = dayjs(start).add(6, 'day').format('YYYY-MM-DD')
    return { start, end }
  }

  if (period === 'monthly') {
    const year = Number(key.slice(0, 4))
    const month = Number(key.slice(5, 7))
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return { start: `${key}-01`, end: `${key}-${pad2(lastDay)}` }
  }

  return { start: `${key}-01-01`, end: `${key}-12-31` }
}

/** 周期前后翻页，返回新的 key */
export function shiftReviewKey(period: ReviewPeriod, key: string, delta: number): string {
  if (period === 'daily') return dayjs(key).add(delta, 'day').format('YYYY-MM-DD')
  if (period === 'weekly') {
    const year = Number(key.slice(0, 4))
    const week = Number(key.slice(6))
    const next = dayjs(mondayOfIsoWeek(year, week)).add(delta * 7, 'day')
    return isoWeekKey(next)
  }
  if (period === 'monthly') return dayjs(`${key}-01`).add(delta, 'month').format('YYYY-MM')
  return String(Number(key) + delta)
}

const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 展示用标题 */
export function reviewLabel(period: ReviewPeriod, key: string): string {
  if (period === 'daily') {
    const value = dayjs(key)
    return `${value.format('YYYY 年 M 月 D 日')} · ${WEEKDAY_LABEL[value.day()]}`
  }
  if (period === 'weekly') {
    const year = Number(key.slice(0, 4))
    const week = Number(key.slice(6))
    const { start, end } = reviewRangeOf(period, key)
    return `${year} 年第 ${week} 周 · ${start.slice(5)} ~ ${end.slice(5)}`
  }
  if (period === 'monthly') return `${key.slice(0, 4)} 年 ${Number(key.slice(5, 7))} 月`
  return `${key} 年`
}

/**
 * 旧数据没有 created_at 时的确定性兜底：
 * 取周期起点，保证同一份数据多次导出时间戳不漂移。
 */
export function reviewCreatedAt(period: ReviewPeriod, key: string): string {
  return `${reviewRangeOf(period, key).start}T00:00:00.000Z`
}

export const isReviewPeriod = (value: unknown): value is ReviewPeriod =>
  typeof value === 'string' && (REVIEW_PERIODS as readonly string[]).includes(value)
