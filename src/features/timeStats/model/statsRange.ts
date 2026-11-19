import dayjs, { type Dayjs } from 'dayjs'
import { isoWeekKey, monthKey, yearKey } from '../../../core/periodKey'

/**
 * 时间统计的周期归一与前后翻页（纯函数，不依赖 React）。
 *
 * 口径：
 * - 周首固定周一，key 用 ISO 周 `YYYY-Www`
 * - day 的 anchor 形如 `YYYY-MM-DD`
 * - week 的 anchor 归一为周一；month 归一为 1 日；year 归一为 1 月 1 日
 */

export type Granularity = 'day' | 'week' | 'month' | 'year'

export const GRANULARITIES: readonly Granularity[] = ['day', 'week', 'month', 'year']

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
}

const DATE_FORMAT = 'YYYY-MM-DD'
const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export interface PeriodRange {
  granularity: Granularity
  /** 归一后的锚点：day=当天；week=周一；month=1 日；year=1 月 1 日 */
  anchor: string
  /** 与 StatsIndex 的桶 key 一致 */
  key: string
  /** YYYY-MM-DD，含 */
  start: string
  /** YYYY-MM-DD，含 */
  end: string
  label: string
}

const mondayOf = (value: Dayjs): Dayjs => value.subtract((value.day() + 6) % 7, 'day')

const toValidDayjs = (raw?: string | null): Dayjs => {
  if (raw) {
    const parsed = dayjs(raw)
    if (parsed.isValid()) return parsed
  }
  return dayjs()
}

/** 把任意合法日期收进当前粒度的锚点 */
export function normalizeAnchor(granularity: Granularity, raw?: string | null): string {
  const value = toValidDayjs(raw)
  switch (granularity) {
    case 'week':
      return mondayOf(value).format(DATE_FORMAT)
    case 'month':
      return value.startOf('month').format(DATE_FORMAT)
    case 'year':
      return value.startOf('year').format(DATE_FORMAT)
    default:
      return value.format(DATE_FORMAT)
  }
}

export function periodRangeOf(granularity: Granularity, anchor?: string | null): PeriodRange {
  const normalized = normalizeAnchor(granularity, anchor)
  const value = dayjs(normalized)

  if (granularity === 'week') {
    const start = mondayOf(value)
    const end = start.add(6, 'day')
    return {
      granularity,
      anchor: normalized,
      key: isoWeekKey(start),
      start: start.format(DATE_FORMAT),
      end: end.format(DATE_FORMAT),
      label: `${isoWeekKey(start)}（${start.format('M/D')}–${end.format('M/D')}）`,
    }
  }

  if (granularity === 'month') {
    const start = value.startOf('month')
    const end = value.endOf('month')
    return {
      granularity,
      anchor: normalized,
      key: monthKey(value),
      start: start.format(DATE_FORMAT),
      end: end.format(DATE_FORMAT),
      label: value.format('YYYY 年 M 月'),
    }
  }

  if (granularity === 'year') {
    const start = value.startOf('year')
    const end = value.endOf('year')
    return {
      granularity,
      anchor: normalized,
      key: yearKey(value),
      start: start.format(DATE_FORMAT),
      end: end.format(DATE_FORMAT),
      label: value.format('YYYY 年'),
    }
  }

  return {
    granularity,
    anchor: normalized,
    key: normalized,
    start: normalized,
    end: normalized,
    label: `${value.format('M 月 D 日')} ${WEEKDAY_LABEL[value.day()]}`,
  }
}

/** 按粒度前后翻页；返回归一后的锚点 */
export function shiftAnchor(granularity: Granularity, anchor: string | null | undefined, delta: number): string {
  const value = dayjs(normalizeAnchor(granularity, anchor))
  switch (granularity) {
    case 'week':
      return normalizeAnchor('week', value.add(delta * 7, 'day').format(DATE_FORMAT))
    case 'month':
      return normalizeAnchor('month', value.add(delta, 'month').format(DATE_FORMAT))
    case 'year':
      return normalizeAnchor('year', value.add(delta, 'year').format(DATE_FORMAT))
    default:
      return normalizeAnchor('day', value.add(delta, 'day').format(DATE_FORMAT))
  }
}

/** 周期内全部日期（含首尾），用于明细逐天取桶，避免全量扫描 */
export function datesInRange(start: string, end: string): string[] {
  const result: string[] = []
  const last = dayjs(end)
  let cursor = dayjs(start)
  while (cursor.isBefore(last) || cursor.isSame(last, 'day')) {
    result.push(cursor.format(DATE_FORMAT))
    cursor = cursor.add(1, 'day')
  }
  return result
}
