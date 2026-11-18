import dayjs from 'dayjs'

/**
 * 日历纯函数：视图范围枚举 + 锚点换算。
 *
 * 约定：
 * 1. 不依赖 React / localStorage / 网络，便于单测与复用。
 * 2. 周口径统一为「周一 ~ 周日」（A7），全项目时间标准一致。
 * 3. 日期键一律使用本地时区的 YYYY-MM-DD 字符串。
 * 4. 跨月/跨年一律经 clampDay 收口，禁止依赖 dayjs 的日期溢出不报错的行为。
 */

export type CalendarView = 'month' | 'week' | 'three' | 'day' | 'year'

/** 五视图的稳定顺序，供页面渲染切换按钮 */
export const CALENDAR_VIEWS: readonly CalendarView[] = ['month', 'week', 'three', 'day', 'year']

/** 周起始日：1 = 周一。改这里之前请同步全项目周口径 */
export const WEEK_START_DAY = 1

/** 月视图固定 42 天（6 行 × 7 列），保证「一屏不滚动」的布局稳定 */
export const MONTH_GRID_DAYS = 42

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** 本地今天，YYYY-MM-DD */
export function todayISO(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** 年月归一：年份非法回落当前年，月份收进 1..12 */
function safeYearMonth(year: number, month: number): { year: number; month: number } {
  const now = dayjs()
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : now.year()
  const safeMonth = Number.isFinite(month) ? Math.min(12, Math.max(1, Math.trunc(month))) : 1
  return { year: safeYear, month: safeMonth }
}

/** 某年某月的天数；月份非法时按 1 月处理 */
export function daysInMonth(year: number, month: number): number {
  const safe = safeYearMonth(year, month)
  return dayjs(new Date(safe.year, safe.month - 1, 1)).daysInMonth()
}

/** 严格校验 YYYY-MM-DD：零填充、月份 1..12、日期不超过当月天数 */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const matched = DATE_PATTERN.exec(value)
  if (!matched) return false
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(year, month)
}

/** 锚点归一：非法日期回落到 fallback，fallback 也非法则用今天 */
export function normalizeAnchor(value: unknown, fallback: string = todayISO()): string {
  if (isValidDateKey(value)) return value
  return isValidDateKey(fallback) ? fallback : todayISO()
}

/** 视图归一：非法值回落到月视图 */
export function normalizeView(value: unknown): CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView) ? (value as CalendarView) : 'month'
}

/**
 * 生成合法的日期键：日期超出当月天数时钳制到月末。
 * 例：clampDay(2026, 2, 31) → '2026-02-28'，绝不溢出到 3 月。
 */
export function clampDay(year: number, month: number, day: number): string {
  const safe = safeYearMonth(year, month)
  const max = daysInMonth(safe.year, safe.month)
  const rawDay = Number.isFinite(day) ? Math.trunc(day) : 1
  const safeDay = Math.min(max, Math.max(1, rawDay))
  return `${safe.year}-${pad2(safe.month)}-${pad2(safeDay)}`
}

/** 锚点所在周的周一 */
export function weekStartOf(date: string): string {
  const value = dayjs(normalizeAnchor(date))
  // day(): 周日=0 … 周六=6；+6 后取模得到「距本周一的天数」
  const offset = (value.day() + 6) % 7
  return value.subtract(offset, 'day').format('YYYY-MM-DD')
}

/** 一周 7 天，周一起 */
export function weekDays(anchor: string): string[] {
  const start = dayjs(weekStartOf(anchor))
  return Array.from({ length: 7 }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'))
}

/** 三日视图：以锚点当天为第 1 天，连续 3 天（不吸附到固定段） */
export function threeDays(anchor: string): string[] {
  const start = dayjs(normalizeAnchor(anchor))
  return Array.from({ length: 3 }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'))
}

export interface MonthGrid {
  /** 固定 42 天，首日为其所在周的周一 */
  days: string[]
  /** 固定 6 行 */
  rows: number
  /** 锚点所在月，YYYY-MM */
  monthKey: string
  /** 当月 1 日在网格中的下标（0..6），用于淡化上月末 */
  leading: number
}

/** 月视图网格：固定 6 行 × 7 列，首行从前一月补足到周一 */
export function monthGrid(anchor: string): MonthGrid {
  const value = dayjs(normalizeAnchor(anchor))
  const first = value.startOf('month')
  const gridStart = dayjs(weekStartOf(first.format('YYYY-MM-DD')))
  const days = Array.from({ length: MONTH_GRID_DAYS }, (_, index) =>
    gridStart.add(index, 'day').format('YYYY-MM-DD'),
  )
  return {
    days,
    rows: MONTH_GRID_DAYS / 7,
    monthKey: first.format('YYYY-MM'),
    leading: first.diff(gridStart, 'day'),
  }
}

export interface MonthSlice {
  /** 1..12 */
  month: number
  /** YYYY-MM */
  monthKey: string
  /** 当月全部日期，1 号起 */
  days: string[]
}

/** 年视图：12 个月，各自展开到当月每一天（2 月按闰年） */
export function yearMonths(year: number): MonthSlice[] {
  const now = dayjs()
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : now.year()
  const base = dayjs(new Date(safeYear, 0, 1))
  return Array.from({ length: 12 }, (_, index) => {
    const start = base.month(index).startOf('month')
    const total = start.daysInMonth()
    return {
      month: index + 1,
      monthKey: start.format('YYYY-MM'),
      days: Array.from({ length: total }, (_, offset) => start.add(offset, 'day').format('YYYY-MM-DD')),
    }
  })
}

/** 视图 → 日期枚举。年视图返回整年 365/366 天，供索引裁剪使用 */
export function viewDays(anchor: string, view: CalendarView): string[] {
  const base = normalizeAnchor(anchor)
  switch (view) {
    case 'month':
      return monthGrid(base).days
    case 'week':
      return weekDays(base)
    case 'three':
      return threeDays(base)
    case 'day':
      return [base]
    case 'year':
      return yearMonths(dayjs(base).year()).flatMap(slice => slice.days)
  }
}

/**
 * 上/下一屏：按视图粒度平移锚点，并保持「日」不变。
 * 月/年平移时若目标月没有该日（如 1-31 → 2 月），钳制到月末。
 */
export function shiftView(anchor: string, view: CalendarView, delta: number): string {
  const value = dayjs(normalizeAnchor(anchor))
  if (!Number.isFinite(delta) || delta === 0) return value.format('YYYY-MM-DD')
  const step = delta > 0 ? 1 : -1

  switch (view) {
    case 'day':
      return value.add(step, 'day').format('YYYY-MM-DD')
    case 'week':
      return value.add(step * 7, 'day').format('YYYY-MM-DD')
    case 'three':
      return value.add(step * 3, 'day').format('YYYY-MM-DD')
    case 'year':
      return clampDay(value.year() + step, value.month() + 1, value.date())
    case 'month': {
      const total = value.year() * 12 + value.month() + step
      return clampDay(Math.floor(total / 12), (total % 12) + 1, value.date())
    }
  }
}
