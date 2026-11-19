import type { TimeBlock } from '../../../core/types'
import { normalizeBlockRange } from '../../../core/timeRange'
import type { NormalizedRange } from '../../../core/timeRange'

/**
 * 日历时间轴纯逻辑：
 * 1. normalizeBlockRange —— 已上移到 core/timeRange（与时间统计共用）
 * 2. layoutDayBlocks —— 扫描线分组 + 组内 lane 分配，输出可直接绝对定位的位置数据
 *
 * 只做计算，不关心像素以外的渲染细节；不依赖 React。
 */

/** 已知异常的最小可见高度由渲染层用 minHeight 兜底，这里只输出真实几何 */

export interface PlacedBlock<T> {
  block: T
  /** 距当天 00:00 的像素偏移 = start * hourHeight */
  top: number
  /** 像素高度 = (end - start) * hourHeight，短块由渲染层 minHeight 兜底 */
  height: number
  /** 横向位置百分比，0..100 */
  leftPct: number
  /** 横向宽度百分比，同组等分 */
  widthPct: number
  /** 组内列号，从 0 开始 */
  lane: number
  /** 本组总列数（= 该时段最大并发数） */
  lanes: number
  abnormal: boolean
}

type BlockLike = Pick<TimeBlock, 'start' | 'end'>

interface Candidate<T> extends NormalizedRange {
  block: T
  index: number
  lane: number
}

/**
 * 单日时间轴布局：
 * - 按 start 升序（同起点长块优先）排序
 * - 扫描线分组：与当前组最大 end 不重叠就开新组
 * - 组内贪心分配 lane：找第一个已空出的列，找不到就新开一列
 * - lanes 取组内列数，等于该组最大并发数（区间图着色最小列数）
 *
 * 复杂度：O(k log k)，k = 当天块数。
 * 输出按 (top, lane) 升序，保证 DOM 顺序稳定。
 */
export function layoutDayBlocks<T extends BlockLike>(
  blocks: readonly T[],
  hourHeight: number,
): PlacedBlock<T>[] {
  const hour = Number.isFinite(hourHeight) && hourHeight > 0 ? hourHeight : 52

  const items: Candidate<T>[] = blocks.map((block, index) => ({
    block,
    index,
    lane: 0,
    ...normalizeBlockRange(block),
  }))

  items.sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index)

  const placed: PlacedBlock<T>[] = []
  let group: Candidate<T>[] = []
  let groupMaxEnd = Number.NEGATIVE_INFINITY
  let laneEnds: number[] = []

  const flush = (): void => {
    if (group.length === 0) return
    const lanes = laneEnds.length
    for (const item of group) {
      placed.push({
        block: item.block,
        top: item.start * hour,
        height: (item.end - item.start) * hour,
        leftPct: (item.lane / lanes) * 100,
        widthPct: 100 / lanes,
        lane: item.lane,
        lanes,
        abnormal: item.abnormal,
      })
    }
    group = []
    laneEnds = []
    groupMaxEnd = Number.NEGATIVE_INFINITY
  }

  for (const item of items) {
    if (group.length > 0 && item.start >= groupMaxEnd) flush()

    let lane = laneEnds.findIndex(end => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }

    item.lane = lane
    group.push(item)
    groupMaxEnd = Math.max(groupMaxEnd, item.end)
  }
  flush()

  placed.sort((a, b) => a.top - b.top || a.lane - b.lane)
  return placed
}
