import type { TimeBlock } from '../../../core/types'
import { classifyTimeBlock } from '../../../core/timeRange'
import { isoWeekKey, monthKey, yearKey } from '../../../core/periodKey'
import { detectOverlaps, toAbnormalHit } from './abnormal'
import type { AbnormalHit, OverlapHit } from './abnormal'
import { datesInRange, periodRangeOf } from './statsRange'
import type { Granularity } from './statsRange'

/**
 * 时间统计聚合索引：一次 O(N) 遍历，同时写入 日 / 周 / 月 / 年 四层桶。
 *
 * 设计目标：
 * - 构建 O(N)，任意粒度查询 O(1)，明细按天取桶 O(天数 + 记录数)
 * - 不排斥异常块：异常块照样进入 blocksByDay 供清理入口使用，只是默认不计入聚合
 * - 统计口径统一用归一后的 end - start，忽略 duration 字段
 */

export const UNCATEGORIZED = '未分类'

export interface CategoryAgg {
  hours: number
  count: number
}

export interface PeriodBucket {
  totalHours: number
  count: number
  byCategory: Map<string, CategoryAgg>
}

export interface CategorySummary {
  category: string
  hours: number
  count: number
  share: number
}

export interface PeriodSummary {
  granularity: Granularity
  key: string
  totalHours: number
  count: number
  categories: CategorySummary[]
}

export interface StatsIndex {
  byDay: Map<string, PeriodBucket>
  byWeek: Map<string, PeriodBucket>
  byMonth: Map<string, PeriodBucket>
  byYear: Map<string, PeriodBucket>
  /** 原始块按天分组（含异常块），供明细与清理入口复用 */
  blocksByDay: Map<string, TimeBlock[]>
  abnormal: AbnormalHit[]
  overlaps: OverlapHit[]
  /** 计入统计的有效块数量 */
  validCount: number
}

export interface BuildStatsIndexOptions {
  /** 默认 true：异常块不进聚合，但保留在 blocksByDay / abnormal 中 */
  excludeAbnormal?: boolean
}

const createBucket = (): PeriodBucket => ({
  totalHours: 0,
  count: 0,
  byCategory: new Map(),
})

const bucketMapOf = (index: StatsIndex, granularity: Granularity): Map<string, PeriodBucket> => {
  switch (granularity) {
    case 'week':
      return index.byWeek
    case 'month':
      return index.byMonth
    case 'year':
      return index.byYear
    default:
      return index.byDay
  }
}

const addToBucket = (
  map: Map<string, PeriodBucket>,
  key: string,
  category: string,
  hours: number,
): void => {
  let bucket = map.get(key)
  if (!bucket) {
    bucket = createBucket()
    map.set(key, bucket)
  }
  bucket.totalHours += hours
  bucket.count += 1
  const current = bucket.byCategory.get(category)
  if (current) {
    current.hours += hours
    current.count += 1
  } else {
    bucket.byCategory.set(category, { hours, count: 1 })
  }
}

export function buildStatsIndex(
  blocks: readonly TimeBlock[] | null | undefined,
  options: BuildStatsIndexOptions = {},
): StatsIndex {
  const excludeAbnormal = options.excludeAbnormal !== false
  const index: StatsIndex = {
    byDay: new Map(),
    byWeek: new Map(),
    byMonth: new Map(),
    byYear: new Map(),
    blocksByDay: new Map(),
    abnormal: [],
    overlaps: [],
    validCount: 0,
  }

  // 同一天可能有多条记录，周期 key 只算一次，避免对每条块重复 dayjs 解析
  const periodCache = new Map<string, { week: string; month: string; year: string }>()
  const periodOf = (date: string) => {
    let cached = periodCache.get(date)
    if (!cached) {
      cached = { week: isoWeekKey(date), month: monthKey(date), year: yearKey(date) }
      periodCache.set(date, cached)
    }
    return cached
  }

  for (const block of blocks ?? []) {
    if (!block || !block.date) continue

    const dayBlocks = index.blocksByDay.get(block.date)
    if (dayBlocks) dayBlocks.push(block)
    else index.blocksByDay.set(block.date, [block])

    const diagnosis = classifyTimeBlock(block)
    if (diagnosis.range.abnormal) {
      const hit = toAbnormalHit(block)
      if (hit) index.abnormal.push(hit)
      if (excludeAbnormal) continue
    }

    const hours = diagnosis.usableSpan
    if (!(hours > 0)) continue

    const category = block.category?.trim() || UNCATEGORIZED
    const period = periodOf(block.date)
    addToBucket(index.byDay, block.date, category, hours)
    addToBucket(index.byWeek, period.week, category, hours)
    addToBucket(index.byMonth, period.month, category, hours)
    addToBucket(index.byYear, period.year, category, hours)
    index.validCount += 1
  }

  index.overlaps = detectOverlaps(blocks ?? [])
  return index
}

export function summarize(
  index: StatsIndex,
  granularity: Granularity,
  anchor?: string | null,
): PeriodSummary {
  const range = periodRangeOf(granularity, anchor)
  const bucket = bucketMapOf(index, granularity).get(range.key)
  if (!bucket) {
    return { granularity, key: range.key, totalHours: 0, count: 0, categories: [] }
  }

  const categories: CategorySummary[] = Array.from(bucket.byCategory.entries())
    .map(([category, agg]) => ({
      category,
      hours: agg.hours,
      count: agg.count,
      share: bucket.totalHours > 0 ? agg.hours / bucket.totalHours : 0,
    }))
    .sort((a, b) => b.hours - a.hours || a.category.localeCompare(b.category))

  return {
    granularity,
    key: range.key,
    totalHours: bucket.totalHours,
    count: bucket.count,
    categories,
  }
}

/** 周期内明细：逐天取桶，不扫描全量数据 */
export function collectBlocks(
  index: StatsIndex,
  granularity: Granularity,
  anchor?: string | null,
): TimeBlock[] {
  const range = periodRangeOf(granularity, anchor)
  const result: TimeBlock[] = []
  for (const date of datesInRange(range.start, range.end)) {
    const list = index.blocksByDay.get(date)
    if (list) result.push(...list)
  }
  return result
}
