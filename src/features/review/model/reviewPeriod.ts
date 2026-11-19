import type { ReviewPeriod } from '../../../core/types'
import {
  REVIEW_PERIODS,
  normalizeReviewKey,
  reviewKeyOfDate,
  reviewLabel,
  reviewRangeOf,
} from '../../../core/reviewKey'

/** 页面 tabs 顺序与短标签 */
export const REVIEW_TABS: readonly { id: ReviewPeriod; label: string }[] = [
  { id: 'daily', label: '每日' },
  { id: 'weekly', label: '每周' },
  { id: 'monthly', label: '每月' },
  { id: 'yearly', label: '每年' },
]

export const REVIEW_PERIOD_LABEL: Record<ReviewPeriod, string> = {
  daily: '日',
  weekly: '周',
  monthly: '月',
  yearly: '年',
}

export { REVIEW_PERIODS, normalizeReviewKey, reviewLabel, reviewRangeOf }

/** 把 URL 里的日期锚点转成目标周期的 key 形状（真正校验交给 normalizeReviewKey） */
function anchorKey(period: ReviewPeriod, date: string): string {
  if (period === 'daily') return date
  if (period === 'weekly') return reviewKeyOfDate('weekly', date) ?? ''
  if (period === 'monthly') return date.slice(0, 7)
  return date.slice(0, 4)
}

/**
 * URL 的 date 只是锚点：日取当天，周/月/年取该日期所属周期。
 * 非法日期先后退到 key 形状，仍非法则由 key 归一返回 null，最终由调用方回落今天。
 */
export function resolveReviewKey(period: ReviewPeriod, anchor: string | null | undefined, today: string): string {
  const candidate = anchor ? normalizeReviewKey(period, anchorKey(period, anchor)) : null
  if (candidate) return candidate
  return normalizeReviewKey(period, anchorKey(period, today)) ?? ''
}

/**
 * 是否属于“尚未结束”的周期：
 * - 日不提示（当天写复盘是常态）
 * - 周/月/年在结束日之前提示，避免用户误以为数据已定稿
 */
export function isPeriodInProgress(period: ReviewPeriod, key: string, today: string): boolean {
  if (period === 'daily') return false
  return reviewRangeOf(period, key).end > today
}

/** 历史列表排序：更新时间优先，其次创建时间，最后按 key 倒序 */
export function compareReviews<T extends { period_key: string; created_at: string; updated_at?: string }>(
  a: T,
  b: T,
): number {
  const timeA = a.updated_at || a.created_at
  const timeB = b.updated_at || b.created_at
  if (timeA !== timeB) return timeA < timeB ? 1 : -1
  if (a.period_key !== b.period_key) return a.period_key < b.period_key ? 1 : -1
  return 0
}
