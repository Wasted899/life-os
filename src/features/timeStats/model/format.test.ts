import { describe, expect, it } from 'vitest'
import { formatDuration, formatHourValue, formatRawHour, parseHourInput } from './format'

describe('timeStats format', () => {
  it('正常时间格式化为 HH:mm', () => {
    expect(formatHourValue(9.5)).toBe('09:30')
    expect(formatHourValue(24)).toBe('24:00')
    expect(formatHourValue(-1)).toBe('00:00')
  })

  it('异常时间保留原始值', () => {
    expect(formatRawHour(42)).toBe('42:00')
    expect(formatRawHour(-1.25)).toBe('-01:15')
    expect(formatRawHour(Number.NaN)).toBe('—')
  })

  it('时长展示', () => {
    expect(formatDuration(1.25)).toBe('1.3h')
    expect(formatDuration(-2)).toBe('-2h')
    expect(formatDuration(0)).toBe('0h')
  })

  it('解析 HH:mm，包含 24:00', () => {
    expect(parseHourInput('09:30')).toBe(9.5)
    expect(parseHourInput('9:05')).toBeCloseTo(9.0833, 3)
    expect(parseHourInput('24:00')).toBe(24)
    expect(parseHourInput(' 8:00 ')).toBe(8)
  })

  it('非法输入返回 null', () => {
    expect(parseHourInput('')).toBeNull()
    expect(parseHourInput('9')).toBeNull()
    expect(parseHourInput('9:60')).toBeNull()
    expect(parseHourInput('abc')).toBeNull()
    expect(parseHourInput('9:5:1')).toBeNull()
  })
})
