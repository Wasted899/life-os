import { describe, it, expect } from 'vitest'
import { formatCNY, fromCents, round2, toCents } from './money'

describe('money', () => {
  it('round2 消除浮点尾差', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(-0.004)).toBe(0)
  })

  it('round2 对非有限值返回 0', () => {
    expect(round2(Number.NaN)).toBe(0)
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('toCents / fromCents 往返一致', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(fromCents(1999)).toBe(19.99)
    expect(fromCents(toCents(-25.5))).toBe(-25.5)
  })

  it('formatCNY 处理正数、负数与零', () => {
    expect(formatCNY(1234.5)).toBe('¥1,234.50')
    expect(formatCNY(-25)).toBe('-¥25.00')
    expect(formatCNY(0)).toBe('¥0.00')
    expect(formatCNY(Number.NaN)).toBe('¥0.00')
  })
})
