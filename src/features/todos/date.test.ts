import {describe,it,expect} from 'vitest'
import {formatDateLabel,shiftDate,todayISO} from './date'

describe('shiftDate', () => {
  it('跨月与跨年', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDate('2026-11-14', 0)).toBe('2026-11-14')
  })

  it('闰年 2 月', () => {
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('formatDateLabel', () => {
  it('输出中文日期与星期', () => {
    expect(formatDateLabel('2026-11-14')).toBe('2026年11月14日 周六')
    expect(formatDateLabel('2026-11-15')).toBe('2026年11月15日 周日')
  })
})

describe('todayISO', () => {
  it('格式为 YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
