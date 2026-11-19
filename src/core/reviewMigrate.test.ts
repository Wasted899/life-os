import { describe, expect, it } from 'vitest'
import { dedupeReviews, normalizeReview, splitLegacyReviews } from './migrate'

const dailyLegacy = { date: '2026-11-19', done: '写完统计', undone: '没跑步', tomorrow: '晨跑', mood: 4 }

describe('normalizeReview（复盘旧数据兼容）', () => {
  it('确定性 id：同一周期重复归一结果一致', () => {
    const a = normalizeReview(dailyLegacy)
    const b = normalizeReview({ ...dailyLegacy, done: '改写' })
    expect(a?.id).toBe('daily:2026-11-19')
    expect(b?.id).toBe(a?.id)
  })

  it('缺失 created_at 时取周期起点，多次归一不漂移', () => {
    const first = normalizeReview(dailyLegacy)
    const second = normalizeReview(dailyLegacy)
    expect(first?.created_at).toBe('2026-11-19T00:00:00.000Z')
    expect(second?.created_at).toBe(first?.created_at)
  })

  it('旧 week/month/year 字段映射到结构化周期', () => {
    expect(normalizeReview({ week: '2026-W3', summary: '周总结', next_week: '下周' })).toMatchObject({
      id: 'weekly:2026-W03',
      period_type: 'weekly',
      period_key: '2026-W03',
      sections: { summary: '周总结', next: '下周' },
    })
    expect(normalizeReview({ month: '2026-2' })?.period_key).toBe('2026-02')
    expect(normalizeReview({ year: '2026' })?.period_type).toBe('yearly')
  })

  it('非法周期 key 被丢弃', () => {
    expect(normalizeReview({ date: '2026-02-30' })).toBeNull()
    expect(normalizeReview({ week: '2026-W99' })).toBeNull()
    expect(normalizeReview({})).toBeNull()
  })

  it('mood 只保留在日复盘', () => {
    expect(normalizeReview(dailyLegacy)?.mood).toBe(4)
    expect(normalizeReview({ week: '2026-W47', mood: 5 })?.mood).toBeUndefined()
    expect(normalizeReview({ date: '2026-11-19', mood: 99 })?.mood).toBe(5)
  })
})

describe('dedupeReviews 同周期去重', () => {
  it('更新时间新的覆盖旧内容，旧内容补缺', () => {
    const older = normalizeReview({ date: '2026-11-19', done: '旧完成', undone: '旧未完成', created_at: '2026-11-19T00:00:00.000Z' })
    const newer = normalizeReview({ date: '2026-11-19', done: '新完成', updated_at: '2026-11-20T00:00:00.000Z' })
    const list = dedupeReviews([older!, newer!])
    expect(list).toHaveLength(1)
    expect(list[0].sections.done).toBe('新完成')
    expect(list[0].sections.undone).toBe('旧未完成')
    expect(list[0].updated_at).toBe('2026-11-20T00:00:00.000Z')
  })
})

describe('splitLegacyReviews 回写旧 key', () => {
  it('daily 的 summary 不再丢失', () => {
    const entry = normalizeReview({
      period_type: 'daily',
      period_key: '2026-11-19',
      sections: { done: 'a', undone: 'b', tomorrow: 'c', summary: '额外总结' },
    })
    const legacy = splitLegacyReviews([entry!])
    expect(legacy.daily[0]).toMatchObject({ date: '2026-11-19', summary: '额外总结' })
  })

  it('周/月/年回写各自的旧字段名', () => {
    const legacy = splitLegacyReviews([
      normalizeReview({ week: '2026-W47', summary: '周', next_week: '下周' })!,
      normalizeReview({ month: '2026-11', summary: '月', next_month: '下月' })!,
      normalizeReview({ year: '2026', summary: '年', next_year: '明年' })!,
    ])
    expect(legacy.weekly[0]).toMatchObject({ week: '2026-W47', next_week: '下周' })
    expect(legacy.monthly[0]).toMatchObject({ month: '2026-11', next_month: '下月' })
    expect(legacy.yearly[0]).toMatchObject({ year: '2026', next_year: '明年' })
  })
})
