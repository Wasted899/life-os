import type { ReviewEntry, ReviewPeriod } from '../../../core/types'
import { readRaw, save, writeLegacy } from '../../../core/storage'
import { dedupeReviews, normalizeReview, splitLegacyReviews } from '../../../core/migrate'

/**
 * 复盘本地存储层（唯一允许触碰 localStorage 的复盘文件）。
 *
 * 规则：
 * 1. `planner:p_reviews` 是唯一真源；存在（包括空数组）就不再读旧 key。
 * 2. 从未迁移过时，把 4 个旧 key 合并、归一、去重后写入新 key；旧 key 永不删除。
 * 3. 每次写入仍同步回写 4 个旧 key，保证回滚到旧页面也能看到数据。
 */

export const REVIEWS_KEY = 'p_reviews'

const LEGACY_KEY_OF: Record<ReviewPeriod, string> = {
  daily: 'p_daily_reviews',
  weekly: 'p_weekly_reviews',
  monthly: 'p_monthly_reviews',
  yearly: 'p_yearly_reviews',
}

const normalizeList = (raw: unknown): ReviewEntry[] => {
  const list = Array.isArray(raw) ? raw : []
  return dedupeReviews(
    list
      .map(item => normalizeReview(item))
      .filter((item): item is ReviewEntry => !!item),
  )
}

/** 读取全部复盘；首次调用会完成旧 key → 新 key 的幂等迁移 */
export function readStoredReviews(): ReviewEntry[] {
  const canonical = readRaw(REVIEWS_KEY)
  if (Array.isArray(canonical)) return normalizeList(canonical)

  const merged: unknown[] = []
  for (const period of Object.keys(LEGACY_KEY_OF) as ReviewPeriod[]) {
    const list = readRaw(LEGACY_KEY_OF[period])
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      // period_type 放在展开之后：旧条目自带的值不能覆盖真实周期
      merged.push({ ...(item as Record<string, unknown>), period_type: period })
    }
  }

  const reviews = normalizeList(merged)
  // 没有旧数据时不写空 key，保留“从未迁移过”的状态
  if (reviews.length > 0) writeStoredReviews(reviews)
  return reviews
}

/** 写回新 key + 4 个旧 key（旧 key 仅作回滚兼容） */
export function writeStoredReviews(reviews: ReviewEntry[]): void {
  const normalized = dedupeReviews(reviews)
  save(REVIEWS_KEY, normalized)
  const legacy = splitLegacyReviews(normalized)
  writeLegacy(LEGACY_KEY_OF.daily, legacy.daily)
  writeLegacy(LEGACY_KEY_OF.weekly, legacy.weekly)
  writeLegacy(LEGACY_KEY_OF.monthly, legacy.monthly)
  writeLegacy(LEGACY_KEY_OF.yearly, legacy.yearly)
}

/** 同周期 upsert：id 与 period_key 任一命中都替换，保证一个周期只有一条 */
export function upsertReview(reviews: ReviewEntry[], next: ReviewEntry): ReviewEntry[] {
  const rest = reviews.filter(review =>
    review.id !== next.id
    && !(review.period_type === next.period_type && review.period_key === next.period_key),
  )
  return [...rest, next]
}

/** 删除单条 */
export function removeReview(reviews: ReviewEntry[], id: string): ReviewEntry[] {
  return reviews.filter(review => review.id !== id)
}
