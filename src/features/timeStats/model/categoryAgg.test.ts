import { describe, expect, it } from 'vitest'
import { aggregateCategories, OTHER_LABEL } from './categoryAgg'
import type { CategorySummary } from './statsIndex'

const items = (hours: number[]): CategorySummary[] => {
  const total = hours.reduce((sum, value) => sum + value, 0)
  return hours.map((value, index) => ({
    category: `c${index}`,
    hours: value,
    count: 1,
    share: total > 0 ? value / total : 0,
  }))
}

describe('categoryAgg：其他聚合', () => {
  it('超过上限的分类合并为「其他」', () => {
    const result = aggregateCategories(items([10, 10, 10, 10, 10, 10, 10, 10]))
    expect(result).toHaveLength(7)
    expect(result[6].category).toBe(OTHER_LABEL)
    expect(result[6].isOther).toBe(true)
    expect(result[6].hours).toBe(20)
    expect(result[6].share).toBeCloseTo(0.25)
  })

  it('占比低于阈值的尾部并入「其他」', () => {
    const result = aggregateCategories(items([80, 10, 4, 3, 2, 1]))
    expect(result[result.length - 1].category).toBe(OTHER_LABEL)
    expect(result[result.length - 1].hours).toBe(1)
  })

  it('至少保留一个真实分类', () => {
    const result = aggregateCategories(items([98, 1, 1]))
    expect(result).toHaveLength(2)
    expect(result[0].category).toBe('c0')
    expect(result[1].category).toBe(OTHER_LABEL)
    expect(result[1].hours).toBe(2)
  })

  it('少量分类保持原样', () => {
    const result = aggregateCategories(items([5, 3, 2]))
    expect(result.map(item => item.category)).toEqual(['c0', 'c1', 'c2'])
    expect(result.every(item => !item.isOther)).toBe(true)
  })

  it('单分类', () => {
    const result = aggregateCategories(items([5]))
    expect(result).toHaveLength(1)
    expect(result[0].isOther).toBe(false)
  })

  it('空数据与零时长', () => {
    expect(aggregateCategories([])).toEqual([])
    expect(aggregateCategories(items([0, 0]))).toEqual([])
  })

  it('按时长降序且并列按名称稳定排序', () => {
    const result = aggregateCategories([
      { category: 'b', hours: 2, count: 1, share: 0.5 },
      { category: 'a', hours: 2, count: 1, share: 0.5 },
    ])
    expect(result.map(item => item.category)).toEqual(['a', 'b'])
  })
})
