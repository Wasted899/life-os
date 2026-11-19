// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { readStoredReviews, removeReview, upsertReview, writeStoredReviews } from './reviewStorage'
import { normalizeReview } from '../../../core/migrate'

const seed = (key: string, value: unknown) => {
  window.localStorage.setItem(key, JSON.stringify(value))
}

const raw = (key: string): unknown => {
  const text = window.localStorage.getItem(key)
  if (!text) return undefined
  const value = JSON.parse(text) as unknown
  return value && typeof value === 'object' && 'v' in value && 'data' in value
    ? (value as { data: unknown }).data
    : value
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('reviewStorage 旧 key 迁移', () => {
  it('4 个旧 key 合并进 p_reviews，旧 key 保留', () => {
    seed('p_daily_reviews', [{ date: '2026-11-19', done: 'a', mood: 4 }])
    seed('p_weekly_reviews', [{ week: '2026-W47', summary: 'w' }])
    seed('p_monthly_reviews', [{ month: '2026-11', summary: 'm' }])
    seed('p_yearly_reviews', [{ year: '2026', summary: 'y' }])

    const reviews = readStoredReviews()
    expect(reviews).toHaveLength(4)
    expect(reviews.find(item => item.period_type === 'weekly')?.period_key).toBe('2026-W47')

    // 新 key 已写入
    expect(Array.isArray(raw('planner:p_reviews'))).toBe(true)
    // 旧 key 未删除
    expect(raw('p_daily_reviews')).toHaveLength(1)
    expect(raw('p_weekly_reviews')).toHaveLength(1)
  })

  it('第二次读取结果一致（幂等）', () => {
    seed('p_daily_reviews', [{ date: '2026-11-19', done: 'a' }])
    const first = readStoredReviews()
    const second = readStoredReviews()
    expect(second).toEqual(first)
    expect(second).toHaveLength(1)
  })

  it('旧条目自带 period_type 不覆盖真实周期', () => {
    seed('p_daily_reviews', [{ date: '2026-11-19', done: 'a', period_type: 'yearly' }])
    const reviews = readStoredReviews()
    expect(reviews[0].period_type).toBe('daily')
    expect(reviews[0].id).toBe('daily:2026-11-19')
  })

  it('新 key 为空数组时尊重“已清空”，不再复活旧数据', () => {
    seed('p_daily_reviews', [{ date: '2026-11-19', done: 'a' }])
    window.localStorage.setItem('planner:p_reviews', JSON.stringify({ v: 1, data: [] }))
    expect(readStoredReviews()).toHaveLength(0)
  })
})

describe('reviewStorage 写入与 upsert', () => {
  it('同一周期只有一条，后写覆盖', () => {
    const first = normalizeReview({ date: '2026-11-19', done: 'a' })!
    const second = normalizeReview({ date: '2026-11-19', done: 'b', updated_at: '2026-11-20T00:00:00.000Z' })!
    const list = upsertReview(upsertReview([], first), second)
    expect(list).toHaveLength(1)
    expect(list[0].sections.done).toBe('b')

    writeStoredReviews(list)
    expect(readStoredReviews()).toHaveLength(1)
    expect(readStoredReviews()[0].sections.done).toBe('b')
  })

  it('写入时同步回写旧 key，回滚旧页面仍可读', () => {
    writeStoredReviews([normalizeReview({ date: '2026-11-19', done: 'a' })!])
    expect(raw('p_daily_reviews')).toHaveLength(1)
  })

  it('删除单条', () => {
    const entry = normalizeReview({ date: '2026-11-19', done: 'a' })!
    expect(removeReview([entry], entry.id)).toHaveLength(0)
  })
})
