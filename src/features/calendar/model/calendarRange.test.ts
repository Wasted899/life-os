import { describe, expect, it } from 'vitest'
import {
  CALENDAR_VIEWS,
  MONTH_GRID_DAYS,
  clampDay,
  daysInMonth,
  isValidDateKey,
  monthGrid,
  normalizeAnchor,
  normalizeView,
  shiftView,
  threeDays,
  viewDays,
  weekDays,
  weekStartOf,
  yearMonths,
} from './calendarRange'

describe('isValidDateKey / normalizeAnchor', () => {
  it('严格校验零填充与当月天数', () => {
    expect(isValidDateKey('2026-11-18')).toBe(true)
    expect(isValidDateKey('2028-02-29')).toBe(true)
    expect(isValidDateKey('2026-02-29')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-2-3')).toBe(false)
    expect(isValidDateKey('')).toBe(false)
    expect(isValidDateKey(null)).toBe(false)
  })

  it('非法锚点回落到 fallback，fallback 也非法时用今天', () => {
    expect(normalizeAnchor('2026-11-18')).toBe('2026-11-18')
    expect(normalizeAnchor('2026-02-31', '2026-01-01')).toBe('2026-01-01')
    expect(normalizeAnchor(undefined, '2026-01-01')).toBe('2026-01-01')
    expect(normalizeAnchor('bad', 'also-bad')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('视图归一：非法值回落到月视图', () => {
    expect(CALENDAR_VIEWS).toEqual(['month', 'week', 'three', 'day', 'year'])
    expect(normalizeView('three')).toBe('three')
    expect(normalizeView('year')).toBe('year')
    expect(normalizeView('bogus')).toBe('month')
    expect(normalizeView(null)).toBe('month')
  })
})

describe('daysInMonth / clampDay', () => {
  it('2 月按闰年返回天数', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
  })

  it('31 日钳制到目标月月末，不溢出到下月', () => {
    expect(clampDay(2026, 2, 31)).toBe('2026-02-28')
    expect(clampDay(2028, 2, 31)).toBe('2028-02-29')
    expect(clampDay(2026, 4, 31)).toBe('2026-04-30')
  })

  it('月份与日期越界都被收口', () => {
    expect(clampDay(2026, 13, 5)).toBe('2026-12-05')
    expect(clampDay(2026, 0, 5)).toBe('2026-01-05')
    expect(clampDay(2026, 2, 0)).toBe('2026-02-01')
    expect(clampDay(2026, 2, Number.NaN)).toBe('2026-02-01')
  })
})

describe('weekStartOf / weekDays：周一起', () => {
  it('周三所在周的周一是 11-16', () => {
    expect(weekStartOf('2026-11-18')).toBe('2026-11-16')
    expect(weekDays('2026-11-18')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
  })

  it('周日属于上一个周一开的周，不再按周日切分', () => {
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09')
    expect(weekDays('2026-11-15')[0]).toBe('2026-11-09')
    expect(weekDays('2026-11-15')[6]).toBe('2026-11-15')
  })

  it('跨年周：12-31 与次年 01-01 落在同一周', () => {
    const days = weekDays('2026-12-31')
    expect(days).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ])
    expect(weekDays('2027-01-01')).toEqual(days)
  })
})

describe('monthGrid：固定 42 天', () => {
  it('2026 年 2 月：首日周一是 01-26，尾日 03-08，来源行 6', () => {
    const grid = monthGrid('2026-02-15')
    expect(grid.days).toHaveLength(MONTH_GRID_DAYS)
    expect(grid.rows).toBe(6)
    expect(grid.monthKey).toBe('2026-02')
    expect(grid.days[0]).toBe('2026-01-26')
    expect(grid.days[MONTH_GRID_DAYS - 1]).toBe('2026-03-08')
    expect(grid.leading).toBe(6)
    expect(grid.days[grid.leading]).toBe('2026-02-01')
  })

  it('闰年 2 月同样固定 42 天，且包含 02-29', () => {
    const grid = monthGrid('2028-02-15')
    expect(grid.days).toHaveLength(42)
    expect(grid.days[0]).toBe('2028-01-31')
    expect(grid.days[41]).toBe('2028-03-12')
    expect(grid.leading).toBe(1)
    expect(grid.days).toContain('2028-02-29')
  })

  it('每个网格首日都是周一、相邻日期连续', () => {
    const grid = monthGrid('2026-11-18')
    expect(grid.days[0]).toBe('2026-10-26')
    for (let i = 1; i < grid.days.length; i += 1) {
      const prev = new Date(`${grid.days[i - 1]}T00:00:00`)
      const next = new Date(`${grid.days[i]}T00:00:00`)
      expect(next.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000)
    }
  })
})

describe('threeDays / yearMonths / viewDays', () => {
  it('三日视图从锚点起连续 3 天，可跨年', () => {
    expect(threeDays('2026-12-30')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
    expect(threeDays('2026-11-18')).toEqual(['2026-11-18', '2026-11-19', '2026-11-20'])
  })

  it('年视图 12 个月，2 月天数随闰年变化', () => {
    const months = yearMonths(2026)
    expect(months).toHaveLength(12)
    expect(months[0]).toMatchObject({ month: 1, monthKey: '2026-01' })
    expect(months[0].days[0]).toBe('2026-01-01')
    expect(months[1].days).toHaveLength(28)
    expect(months[11].days[months[11].days.length - 1]).toBe('2026-12-31')
    expect(yearMonths(2028)[1].days).toHaveLength(29)
  })

  it('viewDays 按视图返回范围，年视图覆盖整年', () => {
    expect(viewDays('2026-11-18', 'month')).toHaveLength(42)
    expect(viewDays('2026-11-18', 'week')).toHaveLength(7)
    expect(viewDays('2026-11-18', 'three')).toHaveLength(3)
    expect(viewDays('2026-11-18', 'day')).toEqual(['2026-11-18'])

    const leapYear = viewDays('2028-06-01', 'year')
    expect(leapYear).toHaveLength(366)
    expect(leapYear[0]).toBe('2028-01-01')
    expect(leapYear[leapYear.length - 1]).toBe('2028-12-31')
    expect(viewDays('2026-06-01', 'year')).toHaveLength(365)
  })
})

describe('shiftView：锚点平移', () => {
  it('月视图平移保持日，目标月不足该日则钳制到月末', () => {
    expect(shiftView('2026-01-31', 'month', 1)).toBe('2026-02-28')
    expect(shiftView('2026-03-31', 'month', -1)).toBe('2026-02-28')
    expect(shiftView('2026-12-15', 'month', 1)).toBe('2027-01-15')
    expect(shiftView('2027-01-15', 'month', -1)).toBe('2026-12-15')
  })

  it('年视图平移在 2-29 上钳制', () => {
    expect(shiftView('2028-02-29', 'year', 1)).toBe('2029-02-28')
    expect(shiftView('2026-11-18', 'year', -1)).toBe('2025-11-18')
  })

  it('周 / 三日 / 日按各自粒度平移，跨年交给 dayjs', () => {
    expect(shiftView('2026-12-31', 'week', 1)).toBe('2027-01-07')
    expect(shiftView('2026-12-30', 'three', 1)).toBe('2027-01-02')
    expect(shiftView('2026-12-31', 'day', 1)).toBe('2027-01-01')
    expect(shiftView('2026-01-01', 'day', -1)).toBe('2025-12-31')
  })

  it('delta 为 0 或非法时原样返回', () => {
    expect(shiftView('2026-11-18', 'month', 0)).toBe('2026-11-18')
    expect(shiftView('2026-11-18', 'week', Number.NaN)).toBe('2026-11-18')
  })
})
