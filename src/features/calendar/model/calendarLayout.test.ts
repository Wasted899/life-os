import { describe, expect, it } from 'vitest'
import { layoutDayBlocks, normalizeBlockRange } from './calendarLayout'

const block = (id: string, start: number, end: number) => ({ id, start, end })

describe('normalizeBlockRange：脏数据收口', () => {
  it('正常区间原样返回', () => {
    expect(normalizeBlockRange(block('a', 9, 10.5))).toEqual({ start: 9, end: 10.5, abnormal: false })
  })

  it('end > 24 截断到 24 并标记异常', () => {
    expect(normalizeBlockRange(block('a', 22, 26))).toEqual({ start: 22, end: 24, abnormal: true })
  })

  it('start 越界被夹回 [0, 24]', () => {
    expect(normalizeBlockRange(block('a', -1, 3))).toEqual({ start: 0, end: 3, abnormal: true })
    expect(normalizeBlockRange(block('a', 25, 26))).toEqual({ start: 24, end: 24, abnormal: true })
  })

  it('end <= start（含相等与倒挂）归零长度并标记异常', () => {
    expect(normalizeBlockRange(block('a', 5, 5))).toEqual({ start: 5, end: 5, abnormal: true })
    expect(normalizeBlockRange(block('a', 7, 6))).toEqual({ start: 7, end: 7, abnormal: true })
  })

  it('非数字入参不产生 NaN 几何', () => {
    expect(normalizeBlockRange(block('a', Number.NaN, 10))).toEqual({ start: 0, end: 10, abnormal: true })
    expect(normalizeBlockRange(block('a', 9, Number.NaN))).toEqual({ start: 9, end: 9, abnormal: true })
  })
})

describe('layoutDayBlocks：重叠并排', () => {
  it('三层重叠各占 1/3，列号互不相同', () => {
    const placed = layoutDayBlocks(
      [block('a', 9, 11), block('b', 9.5, 10.5), block('c', 10, 12)],
      52,
    )

    expect(placed).toHaveLength(3)
    expect(placed.every(item => item.lanes === 3)).toBe(true)
    expect(placed.map(item => item.lane).sort()).toEqual([0, 1, 2])
    placed.forEach(item => {
      expect(item.widthPct).toBeCloseTo(100 / 3, 6)
      expect(item.top).toBeCloseTo(item.block.start * 52, 6)
      expect(item.height).toBeCloseTo((item.block.end - item.block.start) * 52, 6)
    })
    const lefts = placed.map(item => item.leftPct).sort((a, b) => a - b)
    expect(lefts[0]).toBeCloseTo(0, 6)
    expect(lefts[1]).toBeCloseTo(100 / 3, 6)
    expect(lefts[2]).toBeCloseTo(200 / 3, 6)
  })

  it('首尾相接但无重叠的块分成两组，各占满宽', () => {
    const placed = layoutDayBlocks([block('a', 9, 10), block('b', 10, 11)], 52)

    expect(placed).toHaveLength(2)
    placed.forEach(item => {
      expect(item.lanes).toBe(1)
      expect(item.widthPct).toBe(100)
      expect(item.leftPct).toBe(0)
    })
    expect(placed.map(item => item.top)).toEqual([9 * 52, 10 * 52])
  })

  it('链式重叠按最大并发数分列，空出的列可复用', () => {
    const placed = layoutDayBlocks(
      [block('a', 9, 10), block('b', 9.5, 10.5), block('c', 10.2, 11)],
      52,
    )

    expect(placed.every(item => item.lanes === 2)).toBe(true)
    const byId = new Map(placed.map(item => [item.block.id, item]))
    expect(byId.get('a')!.lane).toBe(0)
    expect(byId.get('b')!.lane).toBe(1)
    expect(byId.get('c')!.lane).toBe(0)
  })

  it('end > 24 的脏块只画到 24 点并带异常标记', () => {
    const placed = layoutDayBlocks([block('dirty', 22, 26)], 50)

    expect(placed).toHaveLength(1)
    expect(placed[0].top).toBe(22 * 50)
    expect(placed[0].height).toBe(2 * 50)
    expect(placed[0].abnormal).toBe(true)
  })

  it('零长度块保留在结果里，高度为 0，由渲染层 minHeight 兜底', () => {
    const placed = layoutDayBlocks([block('zero', 12, 12)], 52)

    expect(placed).toHaveLength(1)
    expect(placed[0].height).toBe(0)
    expect(placed[0].abnormal).toBe(true)
  })

  it('同一时刻开始的块并排，不互相覆盖', () => {
    const placed = layoutDayBlocks([block('a', 9, 10), block('b', 9, 11)], 52)

    expect(placed.every(item => item.lanes === 2)).toBe(true)
    expect(placed.map(item => item.lane).sort()).toEqual([0, 1])
  })

  it('hourHeight 非法时回落 52', () => {
    expect(layoutDayBlocks([block('a', 9, 10)], 0)[0].top).toBe(9 * 52)
    expect(layoutDayBlocks([block('a', 9, 10)], Number.NaN)[0].top).toBe(9 * 52)
  })

  it('输出按 top 升序，且保留原始 block 引用', () => {
    const late = block('late', 15, 16)
    const early = block('early', 8, 9)
    const placed = layoutDayBlocks([late, early], 52)

    expect(placed.map(item => item.block.id)).toEqual(['early', 'late'])
    expect(placed[0].block).toBe(early)
  })

  it('空数组返回空结果', () => {
    expect(layoutDayBlocks([], 52)).toEqual([])
  })
})
