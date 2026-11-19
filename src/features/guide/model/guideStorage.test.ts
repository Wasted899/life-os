// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { GuideEntry } from '../../../core/types'
import { BUILTIN_GUIDES } from '../builtinGuides'
import {
  GUIDES_KEY,
  GUIDES_SEEDED_KEY,
  readStoredGuides,
  removeGuide,
  upsertGuide,
  writeStoredGuides,
} from './guideStorage'

const seedRaw = (key: string, value: unknown) => {
  window.localStorage.setItem(`planner:${key}`, JSON.stringify(value))
}

const raw = (key: string): unknown => {
  const text = window.localStorage.getItem(`planner:${key}`)
  if (!text) return undefined
  const value = JSON.parse(text) as unknown
  return value && typeof value === 'object' && 'v' in value && 'data' in value
    ? (value as { data: unknown }).data
    : value
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('guideStorage 首次初始化', () => {
  it('空库播种默认示例并写入标记', () => {
    const guides = readStoredGuides()
    expect(guides).toHaveLength(BUILTIN_GUIDES.length)
    expect(guides.every(item => item.id.startsWith('builtin-'))).toBe(true)
    expect(raw(GUIDES_SEEDED_KEY)).toBe('v1')
    expect(raw(GUIDES_KEY)).toEqual(guides)
  })

  it('已有旧数据原样保留：不注入示例、不改分类', () => {
    const legacy = [{ id: 'old-1', category: 'tips', title: '旧条目', body: ['旧简介'] }]
    seedRaw(GUIDES_KEY, legacy)

    const guides = readStoredGuides()
    expect(guides).toHaveLength(1)
    expect(guides[0].category).toBe('tips')
    expect(guides[0].title).toBe('旧条目')
    expect(raw(GUIDES_SEEDED_KEY)).toBe('v1')
  })

  it('用户删除示例后不会被重新灌回', () => {
    const seeded = readStoredGuides()
    writeStoredGuides(seeded.slice(1))

    const again = readStoredGuides()
    expect(again).toHaveLength(seeded.length - 1)
    expect(again.some(item => item.id === seeded[0].id)).toBe(false)
  })
})

describe('guideStorage 增删改', () => {
  const entry = (id: string, title: string): GuideEntry => ({
    id,
    category: 'kaoyan',
    title,
    body: ['简介'],
    links: [{ label: '官网', url: 'https://example.com/' }],
  })

  it('upsert：同 id 覆盖，新 id 追加', () => {
    const base = [entry('a', 'A')]
    expect(upsertGuide(base, entry('a', 'A2'))).toEqual([entry('a', 'A2')])
    expect(upsertGuide(base, entry('b', 'B'))).toHaveLength(2)
    expect(base).toHaveLength(1)
  })

  it('remove：按 id 过滤且不修改原数组', () => {
    const base = [entry('a', 'A'), entry('b', 'B')]
    expect(removeGuide(base, 'a')).toEqual([entry('b', 'B')])
    expect(base).toHaveLength(2)
  })
})
