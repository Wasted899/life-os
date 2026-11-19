import type { TimeBlock } from './types'

/**
 * 时间块区间归一与异常判定（日历 / 时间统计共用的唯一实现）。
 *
 * 约束：
 * - 只做计算，不修改数据；调用方决定是"渲染时收口"还是"清理入口处理"
 * - abnormal 的判定口径必须与日历历史行为完全一致
 */

export interface NormalizedRange {
  /** 0..24 */
  start: number
  /** start..24，且恒不小于 start */
  end: number
  /** 原始数据越界 / 倒挂 / 非法时置 true */
  abnormal: boolean
}

export type AbnormalReason =
  | 'non_numeric'
  | 'start_out_of_range'
  | 'end_over_24'
  | 'end_not_after_start'

export interface TimeBlockDiagnosis {
  range: NormalizedRange
  reasons: AbnormalReason[]
  /** 原始声明时长 = rawEnd - rawStart，可能为负或 NaN */
  rawSpan: number
  /** 归一后可计入的时长 = range.end - range.start */
  usableSpan: number
}

type BlockLike = Pick<TimeBlock, 'start' | 'end'>

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * 时间块范围归一：
 * - start = clamp(start, 0, 24)
 * - end   = clamp(end, start, 24)
 * - 原始 end > 24、end <= start、start 越界、非数字 → abnormal = true
 */
export function normalizeBlockRange(block: BlockLike): NormalizedRange {
  const rawStart = Number(block.start)
  const rawEnd = Number(block.end)
  const start = Number.isFinite(rawStart) ? clamp(rawStart, 0, 24) : 0
  const end = Number.isFinite(rawEnd) ? clamp(rawEnd, start, 24) : start
  const abnormal =
    !Number.isFinite(rawStart) ||
    !Number.isFinite(rawEnd) ||
    rawStart < 0 ||
    rawStart > 24 ||
    rawEnd > 24 ||
    rawEnd <= rawStart
  return { start, end, abnormal }
}

/** 在归一结果上追加具体原因，供统计页清理入口分组筛选 */
export function classifyTimeBlock(block: BlockLike): TimeBlockDiagnosis {
  const rawStart = Number(block.start)
  const rawEnd = Number(block.end)
  const range = normalizeBlockRange(block)
  const reasons: AbnormalReason[] = []

  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    reasons.push('non_numeric')
  } else {
    if (rawStart < 0 || rawStart > 24) reasons.push('start_out_of_range')
    if (rawEnd > 24) reasons.push('end_over_24')
    if (rawEnd <= rawStart) reasons.push('end_not_after_start')
  }

  return {
    range,
    reasons,
    rawSpan: rawEnd - rawStart,
    usableSpan: range.end - range.start,
  }
}
