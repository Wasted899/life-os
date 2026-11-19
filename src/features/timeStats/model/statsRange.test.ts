import { describe, expect, it } from 'vitest'
import { datesInRange, normalizeAnchor, periodRangeOf, shiftAnchor } from './statsRange'

describe('statsRange：粒度归一与周期区间', () => {
  it('week 锚点归一为周一', () => {
    expect(normalizeAnchor('week', '2026-11-19')).toBe('2026-11-16')
  })

  it('周周期 key 使用 ISO 周', () => {
    const range = periodRangeOf('week', '2026-11-19')
    expect(range.key).toBe('2026-W47')
    expect(range.start).toBe('2026-11-16')
    expect(range.end).toBe('2026-11-22')
    expect(range.label).toContain('2026-W47')
  })

  it('跨年周按 ISO 归属上一年', () => {
    expect(normalizeAnchor('week', '2027-01-01')).toBe('2026-12-28')
    expect(periodRangeOf('week', '2027-01-01').key).toBe('2026-W53')
  })

  it('month / year 区间与 key', () => {
    const month = periodRangeOf('month', '2026-11-19')
    expect(month.key).toBe('2026-11')
    expect(month.start).toBe('2026-11-01')
    expect(month.end).toBe('2026-11-30')

    const year = periodRangeOf('year', '2026-11-19')
    expect(year.key).toBe('2026')
    expect(year.start).toBe('2026-01-01')
    expect(year.end).toBe('2026-12-31')
  })

  it('day 区间就是当天', () => {
    const day = periodRangeOf('day', '2026-11-19')
    expect(day.key).toBe('2026-11-19')
    expect(day.start).toBe('2026-11-19')
    expect(day.end).toBe('2026-11-19')
  })

  it('非法锚点回落到今天，不抛错', () => {
    expect(normalizeAnchor('day', 'not-a-date')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('前后翻页', () => {
    expect(shiftAnchor('day', '2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftAnchor('week', '2026-11-16', 1)).toBe('2026-11-23')
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftAnchor('year', '2026-11-19', 1)).toBe('2027-01-01')
  })

  it('周期内日期逐天展开', () => {
    expect(datesInRange('2026-11-16', '2026-11-22')).toHaveLength(7)
    expect(datesInRange('2026-11-30', '2026-12-01')).toEqual(['2026-11-30', '2026-12-01'])
  })
})
