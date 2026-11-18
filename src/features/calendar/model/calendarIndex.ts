import type { TimeBlock, Todo } from '../../../core/types'

/**
 * 日历按天索引：一次遍历把 todos / timeBlocks 折成 Map<YYYY-MM-DD, DayBucket>。
 *
 * 复杂度：O(n + m)，查询 O(1)。
 * 目的是让五个视图都只做 Map 查表，禁止在渲染中反复 filter 全量数组。
 */

export interface DayBucket {
  date: string
  todos: Todo[]
  blocks: TimeBlock[]
  /** 当天条目总数 = todos + blocks，作为年视图热力的统计口径 */
  count: number
}

export type CalendarIndex = Map<string, DayBucket>

/**
 * 建索引：
 * - todos 按 due_date 归天，未排期（无 due_date）不进入日历
 * - timeBlocks 按 date 归天
 * - 同一天内保持数据源原有顺序，排序交给视图层
 */
export function buildCalendarIndex(
  todos: readonly Todo[],
  blocks: readonly TimeBlock[],
): CalendarIndex {
  const index: CalendarIndex = new Map()

  const bucketOf = (date: string): DayBucket => {
    const existing = index.get(date)
    if (existing) return existing
    const created: DayBucket = { date, todos: [], blocks: [], count: 0 }
    index.set(date, created)
    return created
  }

  for (const todo of todos) {
    const date = todo.due_date
    if (!date) continue
    const bucket = bucketOf(date)
    bucket.todos.push(todo)
    bucket.count += 1
  }

  for (const block of blocks) {
    const date = block.date
    if (!date) continue
    const bucket = bucketOf(date)
    bucket.blocks.push(block)
    bucket.count += 1
  }

  return index
}

/** 查询某天；没有数据时返回空桶（不写入索引，避免污染统计） */
export function getDayBucket(index: CalendarIndex, date: string): DayBucket {
  return index.get(date) ?? { date, todos: [], blocks: [], count: 0 }
}
