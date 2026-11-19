import { describe, expect, it } from 'vitest'
import {
  mondayOfIsoWeek,
  normalizeReviewKey,
  reviewCreatedAt,
  reviewKeyOfDate,
  reviewLabel,
  reviewRangeOf,
  shiftReviewKey,
} from '../../../core/reviewKey'
import { compareReviews, isPeriodInProgress, resolveReviewKey } from './reviewPeriod'

describe('reviewKey 归一', () => {
  it('daily：补零、拒绝不存在的日期', () => {
    expect(normalizeReviewKey('daily', '2026-1-5')).toBe('2026-01-05')
    expect(normalizeReviewKey('daily', '2026-02-30')).toBeNull()
    expect(normalizeReviewKey('daily', '')).toBeNull()
    expect(normalizeReviewKey('daily', 20260105)).toBeNull()
  })

  it('weekly：补零、拒绝越界周与不存在的 W53', () => {
    expect(normalizeReviewKey('weekly', '2026-W3')).toBe('2026-W03')
    expect(normalizeReviewKey('weekly', '2026-W54')).toBeNull()
    expect(normalizeReviewKey('weekly', '2025-W53')).toBeNull()
    expect(normalizeReviewKey('weekly', '2026-W53')).toBe('2026-W53')
  })

  it('monthly / yearly：补零与范围校验', () => {
    expect(normalizeReviewKey('monthly', '2026-1')).toBe('2026-01')
    expect(normalizeReviewKey('monthly', '2026-13')).toBeNull()
    expect(normalizeReviewKey('yearly', '2026')).toBe('2026')
    expect(normalizeReviewKey('yearly', '26')).toBeNull()
  })

  it('日期锚点 → 周期 key', () => {
    expect(reviewKeyOfDate('daily', '2026-11-19')).toBe('2026-11-19')
    expect(reviewKeyOfDate('weekly', '2026-11-19')).toBe('2026-W47')
    expect(reviewKeyOfDate('monthly', '2026-11-19')).toBe('2026-11')
    expect(reviewKeyOfDate('yearly', '2026-11-19')).toBe('2026')
  })
})

describe('reviewRangeOf / shift / label', () => {
  it('周区间从周一到周日', () => {
    expect(mondayOfIsoWeek(2026, 47)).toBe('2026-11-16')
    expect(reviewRangeOf('weekly', '2026-W47')).toEqual({ start: '2026-11-16', end: '2026-11-22' })
  })

  it('月/年区间包含端点', () => {
    expect(reviewRangeOf('monthly', '2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(reviewRangeOf('yearly', '2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('前后翻页跨月/跨年正确', () => {
    expect(shiftReviewKey('daily', '2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftReviewKey('weekly', '2026-W47', 1)).toBe('2026-W48')
    expect(shiftReviewKey('monthly', '2026-12', 1)).toBe('2027-01')
    expect(shiftReviewKey('yearly', '2026', -1)).toBe('2025')
  })

  it('缺失 created_at 的兜底稳定不漂移', () => {
    expect(reviewCreatedAt('daily', '2026-11-19')).toBe('2026-11-19T00:00:00.000Z')
    expect(reviewCreatedAt('weekly', '2026-W47')).toBe('2026-11-16T00:00:00.000Z')
    expect(reviewCreatedAt('monthly', '2026-11')).toBe('2026-11-01T00:00:00.000Z')
    expect(reviewCreatedAt('yearly', '2026')).toBe('2026-01-01T00:00:00.000Z')
  })

  it('label 可读', () => {
    expect(reviewLabel('weekly', '2026-W47')).toContain('第 47 周')
    expect(reviewLabel('monthly', '2026-11')).toBe('2026 年 11 月')
  })
})

describe('页面辅助', () => {
  it('非法锚点回落今天', () => {
    expect(resolveReviewKey('daily', 'bad', '2026-11-19')).toBe('2026-11-19')
    expect(resolveReviewKey('weekly', null, '2026-11-19')).toBe('2026-W47')
    expect(resolveReviewKey('monthly', '2026-11-19', '2026-01-01')).toBe('2026-11')
    expect(resolveReviewKey('yearly', '2026-11-19', '2026-01-01')).toBe('2026')
  })

  it('只有周/月/年未结束时提示进行中', () => {
    expect(isPeriodInProgress('daily', '2026-11-19', '2026-11-19')).toBe(false)
    expect(isPeriodInProgress('weekly', '2026-W47', '2026-11-19')).toBe(true)
    expect(isPeriodInProgress('weekly', '2026-W46', '2026-11-19')).toBe(false)
  })

  it('历史排序按更新时间倒序', () => {
    const list = [
      { period_key: '2026-11-18', created_at: '2026-11-18T00:00:00.000Z' },
      { period_key: '2026-11-19', created_at: '2026-11-19T00:00:00.000Z', updated_at: '2026-11-19T10:00:00.000Z' },
    ]
    expect([...list].sort(compareReviews)[0].period_key).toBe('2026-11-19')
  })
})
