import { describe, expect, it } from 'vitest'
import type { TimeBlock } from '../../../core/types'
import { buildStatsIndex, collectBlocks, summarize } from './statsIndex'

const block = (patch: Partial<TimeBlock>): TimeBlock => ({
  id: patch.id ?? 'b',
  date: patch.date ?? '2026-11-16',
  start: patch.start ?? 9,
  end: patch.end ?? 10,
  title: patch.title ?? '记录',
  category: patch.category ?? '学习',
  ...patch,
})

const dataset: TimeBlock[] = [
  block({ id: 'a', date: '2026-11-16', start: 9, end: 11, category: '学习' }),
  block({ id: 'b', date: '2026-11-16', start: 13, end: 14.5, category: '学习' }),
  block({ id: 'c', date: '2026-11-17', start: 10, end: 12, category: '工作' }),
  block({ id: 'd', date: '2026-10-31', start: 20, end: 22, category: '学习' }),
  block({ id: 'e', date: '2027-01-01', start: 8, end: 10, category: '工作' }),
]

describe('statsIndex：四层桶聚合', () => {
  it('日粒度按分类求和', () => {
    const index = buildStatsIndex(dataset)
    const summary = summarize(index, 'day', '2026-11-16')
    expect(summary.totalHours).toBe(3.5)
    expect(summary.count).toBe(2)
    expect(summary.categories).toHaveLength(1)
    expect(summary.categories[0]).toMatchObject({ category: '学习', hours: 3.5, count: 2, share: 1 })
  })

  it('周 / 月 / 年桶各自独立', () => {
    const index = buildStatsIndex(dataset)
    expect(summarize(index, 'week', '2026-11-19').totalHours).toBe(5.5)
    expect(summarize(index, 'week', '2026-11-19').categories.map(item => item.category)).toEqual(['学习', '工作'])
    expect(summarize(index, 'month', '2026-11-19').totalHours).toBe(5.5)
    expect(summarize(index, 'year', '2026-06-01').totalHours).toBe(7.5)
    expect(summarize(index, 'year', '2027-06-01').totalHours).toBe(2)
  })

  it('周期明细只取范围内的块', () => {
    const index = buildStatsIndex(dataset)
    expect(collectBlocks(index, 'week', '2026-11-19').map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(collectBlocks(index, 'month', '2026-11-19')).toHaveLength(3)
    expect(collectBlocks(index, 'year', '2026-06-01')).toHaveLength(4)
  })

  it('异常块默认排除，但保留在明细与 abnormal 中', () => {
    const dirty = block({ id: 'dirty', date: '2026-11-16', start: 0, end: 42, category: '睡眠' })
    const index = buildStatsIndex([...dataset, dirty])
    const summary = summarize(index, 'day', '2026-11-16')
    expect(summary.totalHours).toBe(3.5)
    expect(summary.categories.some(item => item.category === '睡眠')).toBe(false)
    expect(index.abnormal).toHaveLength(1)
    expect(index.abnormal[0].rawSpan).toBe(42)
    expect(index.abnormal[0].usableSpan).toBe(24)
    expect(index.abnormal[0].reasons).toContain('end_over_24')
    expect(index.blocksByDay.get('2026-11-16')?.some(item => item.id === 'dirty')).toBe(true)
  })

  it('显式关闭 excludeAbnormal 时按归一后时长计入', () => {
    const dirty = block({ id: 'dirty', date: '2026-11-16', start: 0, end: 42 })
    const index = buildStatsIndex([dirty], { excludeAbnormal: false })
    expect(summarize(index, 'day', '2026-11-16').totalHours).toBe(24)
    expect(index.validCount).toBe(1)
  })

  it('非数字区间不崩溃', () => {
    const bad = block({ id: 'nan', start: Number.NaN, end: Number.NaN })
    const index = buildStatsIndex([bad])
    expect(index.abnormal).toHaveLength(1)
    expect(index.abnormal[0].reasons).toContain('non_numeric')
    expect(summarize(index, 'day', '2026-11-16').totalHours).toBe(0)
  })

  it('空数据返回空结果', () => {
    const index = buildStatsIndex([])
    expect(index.validCount).toBe(0)
    expect(summarize(index, 'day', '2026-11-16').categories).toEqual([])
    expect(collectBlocks(index, 'year', '2026-01-01')).toEqual([])
  })

  it('未分类统一归入「未分类」', () => {
    const index = buildStatsIndex([block({ id: 'x', category: '  ' })])
    expect(summarize(index, 'day', '2026-11-16').categories[0].category).toBe('未分类')
  })

  it('2 万条数据构建在预算内', () => {
    const many: TimeBlock[] = []
    for (let index = 0; index < 20000; index += 1) {
      const day = String((index % 28) + 1).padStart(2, '0')
      many.push(block({ id: `m${index}`, date: `2026-11-${day}`, start: 8, end: 9, category: `分类${index % 7}` }))
    }
    const started = performance.now()
    const index = buildStatsIndex(many)
    const cost = performance.now() - started
    expect(index.validCount).toBe(20000)
    expect(cost).toBeLessThan(200)
  })
})
