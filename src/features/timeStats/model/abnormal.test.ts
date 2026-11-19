import { describe, expect, it } from 'vitest'
import type { TimeBlock } from '../../../core/types'
import { detectOverlaps, toAbnormalHit } from './abnormal'

const block = (id: string, start: number, end: number, date = '2026-11-16'): TimeBlock => ({
  id,
  date,
  start,
  end,
  title: id,
  category: '学习',
})

describe('abnormal：异常识别与疑似重叠', () => {
  it('异常块生成可展示的原因与时长', () => {
    const hit = toAbnormalHit(block('x', 0, 42))
    expect(hit).not.toBeNull()
    expect(hit?.rawSpan).toBe(42)
    expect(hit?.usableSpan).toBe(24)
    expect(hit?.reasons).toContain('end_over_24')
  })

  it('正常块不产生异常项', () => {
    expect(toAbnormalHit(block('ok', 9, 10))).toBeNull()
  })

  it('识别倒挂区间', () => {
    const hit = toAbnormalHit(block('rev', 10, 9))
    expect(hit?.reasons).toContain('end_not_after_start')
    expect(hit?.usableSpan).toBe(0)
  })

  it('同一天重叠只标记后一个块', () => {
    const hits = detectOverlaps([block('a', 9, 11), block('b', 10, 12)])
    expect(hits).toHaveLength(1)
    expect(hits[0].block.id).toBe('b')
    expect(hits[0].overlapWith.id).toBe('a')
    expect(hits[0].overlapHours).toBe(1)
  })

  it('首尾相接不算重叠', () => {
    expect(detectOverlaps([block('a', 9, 10), block('b', 10, 11)])).toEqual([])
  })

  it('连续覆盖时记录当前最大 end', () => {
    const hits = detectOverlaps([block('a', 9, 12), block('b', 10, 11), block('c', 11, 13)])
    expect(hits.map(hit => hit.block.id)).toEqual(['b', 'c'])
    expect(hits[1].overlapWith.id).toBe('a')
  })

  it('异常块不参与重叠检测', () => {
    expect(detectOverlaps([block('a', 0, 42), block('b', 1, 2)])).toEqual([])
  })

  it('跨天相同时间不互相影响', () => {
    expect(detectOverlaps([block('a', 9, 11, '2026-11-16'), block('b', 9, 11, '2026-11-17')])).toEqual([])
  })
})
