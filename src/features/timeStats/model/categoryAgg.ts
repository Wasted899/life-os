import type { CategorySummary } from './statsIndex'

/**
 * 分类占比的「其他」聚合：
 * - 按时长降序保留前 max 个
 * - 其余分类 + 占比低于 minShare 的尾部合并为「其他」
 * - 至少保留 1 个真实分类，避免整图只剩「其他」
 */

export const OTHER_LABEL = '其他'

export interface AggregatedCategory extends CategorySummary {
  isOther: boolean
}

export interface AggregateOptions {
  /** 最多展示的分类数（不含「其他」），默认 6 */
  max?: number
  /** 低于该占比的分类并入「其他」，默认 2% */
  minShare?: number
}

export function aggregateCategories(
  items: readonly CategorySummary[],
  options: AggregateOptions = {},
): AggregatedCategory[] {
  const max = options.max ?? 6
  const minShare = options.minShare ?? 0.02

  const sorted = items
    .filter(item => item.hours > 0)
    .slice()
    .sort((a, b) => b.hours - a.hours || a.category.localeCompare(b.category))

  if (sorted.length === 0) return []
  if (sorted.length === 1) {
    return [{ ...sorted[0], isOther: false }]
  }

  const head = sorted.slice(0, Math.max(1, max)).map(item => ({ ...item, isOther: false }))
  const tail = sorted.slice(Math.max(1, max)).map(item => ({ ...item, isOther: false }))

  while (head.length > 1 && head[head.length - 1].share < minShare) {
    const moved = head.pop()
    if (moved) tail.unshift(moved)
  }

  if (tail.length === 0) return head

  const otherHours = tail.reduce((sum, item) => sum + item.hours, 0)
  const otherCount = tail.reduce((sum, item) => sum + item.count, 0)
  const total = head.reduce((sum, item) => sum + item.hours, 0) + otherHours
  const other: AggregatedCategory = {
    category: OTHER_LABEL,
    hours: otherHours,
    count: otherCount,
    share: total > 0 ? otherHours / total : 0,
    isOther: true,
  }

  return [...head, other]
}
