import type { ReviewEntry, ReviewPeriod } from '../../../core/types'
import { compareReviews } from './reviewPeriod'

export const REVIEW_PAGE_SIZE = 10

export type ReviewFilter = 'all' | ReviewPeriod

export interface ReviewHistoryPage {
  items: ReviewEntry[]
  page: number
  totalPages: number
  total: number
}

/** 摘要：取第一个非空字段，截断到指定长度 */
export function reviewSnippet(review: ReviewEntry, maxLength = 80): string {
  const values = Object.values(review.sections).filter((value): value is string => typeof value === 'string' && !!value.trim())
  if (!values.length) return '尚未填写内容'
  const text = values[0].replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/** 先按周期筛选，再按更新时间倒序 */
export function filterReviews(reviews: ReviewEntry[], filter: ReviewFilter): ReviewEntry[] {
  const matched = filter === 'all' ? reviews : reviews.filter(review => review.period_type === filter)
  return [...matched].sort(compareReviews)
}

/** 分页；page 越界时回落到最后一页 */
export function paginateReviews(
  reviews: ReviewEntry[],
  filter: ReviewFilter,
  page: number,
  pageSize = REVIEW_PAGE_SIZE,
): ReviewHistoryPage {
  const sorted = filterReviews(reviews, filter)
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    items: sorted.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total: sorted.length,
  }
}
