import dayjs, { type Dayjs } from 'dayjs'

/**
 * 周期 key 的唯一实现：周 / 月 / 年。
 *
 * 口径（已拍板 D30）：
 * - 周首固定为周一，ISO 8601 周，key 形如 `2026-W46`
 * - 跨年按 ISO 周归属，如 2027-01-01 属于 2026-W53
 * - 月用 `YYYY-MM`，年用 `YYYY`
 */

/** ISO 周：周一开始，跨年按 ISO 8601 */
export const isoWeekKey = (date: string | Dayjs): string => {
  const value = typeof date === 'string' ? dayjs(date) : date
  const target = new Date(Date.UTC(value.year(), value.month(), value.date()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const monthKey = (date: string | Dayjs): string => {
  const value = typeof date === 'string' ? dayjs(date) : date
  return value.format('YYYY-MM')
}

export const yearKey = (date: string | Dayjs): string => {
  const value = typeof date === 'string' ? dayjs(date) : date
  return value.format('YYYY')
}
