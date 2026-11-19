import type { TimeBlock } from '../../../core/types'
import { classifyTimeBlock } from '../../../core/timeRange'
import type { AbnormalReason } from '../../../core/timeRange'

/**
 * 异常时间块收集与疑似重叠检测。
 *
 * 判定口径与日历完全一致（core/timeRange），这里只负责：
 * 1. 把 classify 结果整理成可展示的 AbnormalHit
 * 2. 同一天内做扫描线重叠检测（信息项，不参与批量删除）
 */

export interface AbnormalHit {
  block: TimeBlock
  reasons: AbnormalReason[]
  /** 原始声明时长 = end - start，可能为负或 NaN */
  rawSpan: number
  /** 归一后可计入的时长 */
  usableSpan: number
}

export interface OverlapHit {
  date: string
  block: TimeBlock
  overlapWith: TimeBlock
  overlapHours: number
}

export function toAbnormalHit(block: TimeBlock): AbnormalHit | null {
  const diagnosis = classifyTimeBlock(block)
  if (!diagnosis.range.abnormal) return null
  return {
    block,
    reasons: diagnosis.reasons,
    rawSpan: diagnosis.rawSpan,
    usableSpan: diagnosis.usableSpan,
  }
}

interface Candidate {
  block: TimeBlock
  start: number
  end: number
}

/**
 * 同一天内的疑似重叠：按 start 升序扫描，记录当前最大 end。
 * 只有区间合法的块参与，异常块不制造噪音。
 * 复杂度 O(k log k) / 天，整体 O(N log N)。
 */
export function detectOverlaps(blocks: readonly TimeBlock[]): OverlapHit[] {
  const byDate = new Map<string, Candidate[]>()

  for (const block of blocks) {
    if (!block?.date) continue
    const diagnosis = classifyTimeBlock(block)
    if (diagnosis.range.abnormal) continue
    if (!(diagnosis.usableSpan > 0)) continue
    const list = byDate.get(block.date)
    const candidate: Candidate = {
      block,
      start: diagnosis.range.start,
      end: diagnosis.range.end,
    }
    if (list) list.push(candidate)
    else byDate.set(block.date, [candidate])
  }

  const hits: OverlapHit[] = []
  for (const [date, list] of byDate) {
    if (list.length < 2) continue
    list.sort((a, b) => a.start - b.start || a.end - b.end)
    let active = list[0]
    for (let index = 1; index < list.length; index += 1) {
      const current = list[index]
      if (current.start < active.end) {
        hits.push({
          date,
          block: current.block,
          overlapWith: active.block,
          overlapHours: Math.min(current.end, active.end) - current.start,
        })
      }
      if (current.end > active.end) active = current
    }
  }

  return hits
}
