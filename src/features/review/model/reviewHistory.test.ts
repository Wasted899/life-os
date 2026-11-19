import { describe, expect, it } from 'vitest'
import type { ReviewEntry } from '../../../core/types'
import { filterReviews, paginateReviews, reviewSnippet } from './reviewHistory'

const entry = (period: ReviewEntry['period_type'], key: string, sections: Record<string, string>, updated?: string): ReviewEntry => ({
  id: `${period}:${key}`,
  period_type: period,
  period_key: key,
  sections,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: updated,
})

describe('reviewHistory', () => {
  const reviews = [
    entry('daily', '2026-11-18', { done: 'a' }, '2026-11-18T10:00:00.000Z'),
    entry('daily', '2026-11-19', { done: 'b' }, '2026-11-19T10:00:00.000Z'),
    entry('weekly', '2026-W47', { summary: 'w' }, '2026-11-20T10:00:00.000Z'),
  ]

  it('按周期筛选并倒序', () => {
    expect(filterReviews(reviews, 'daily').map(item => item.period_key)).toEqual(['2026-11-19', '2026-11-18'])
    expect(filterReviews(reviews, 'weekly')).toHaveLength(1)
    expect(filterReviews(reviews, 'all')[0].period_key).toBe('2026-W47')
  })

  it('分页边界：每页 10 条、越界回落末页', () => {
    const many = Array.from({ length: 23 }, (_, index) =>
      entry('daily', `2026-11-${String(index + 1).padStart(2, '0')}`, { done: 'x' }),
    )
    expect(paginateReviews(many, 'all', 1).items).toHaveLength(10)
    expect(paginateReviews(many, 'all', 3).items).toHaveLength(3)
    expect(paginateReviews(many, 'all', 99).page).toBe(3)
    expect(paginateReviews([], 'all', 5)).toMatchObject({ page: 1, totalPages: 1, total: 0 })
  })

  it('摘要取第一个非空字段并截断', () => {
    expect(reviewSnippet(entry('daily', '2026-11-19', { done: '', undone: '没跑步' }))).toBe('没跑步')
    expect(reviewSnippet(entry('daily', '2026-11-19', {}))).toBe('尚未填写内容')
    expect(reviewSnippet(entry('daily', '2026-11-19', { done: 'x'.repeat(120) }), 10)).toBe('xxxxxxxxxx…')
  })
})
