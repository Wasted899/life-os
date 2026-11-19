// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { Theme } from '../../../core/types'
import { BUILTIN_THEMES } from '../builtinThemes'
import {
  ACTIVE_THEME_KEY,
  THEMES_KEY,
  persistActiveThemeId,
  persistThemeSet,
  readActiveThemeId,
  readAllThemes,
  readCustomThemes,
} from './themeStorage'
import { THEME_IMAGE_MAX_CHARS } from './imagePipeline'

const custom = (id: string, extra: Partial<Theme> = {}): Theme => ({
  id,
  name: id,
  primary: '#2563eb',
  sidebar: '#1e3a5f',
  custom: true,
  ...extra,
})

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

describe('readCustomThemes', () => {
  it('空库返回空数组', () => {
    expect(readCustomThemes()).toEqual([])
  })

  it('丢弃与预设同 id 的条目，预设不可被覆盖', () => {
    window.localStorage.setItem(
      `planner:${THEMES_KEY}`,
      JSON.stringify({ v: 1, data: [custom('blue', { name: '假蓝' }), custom('c-1')] }),
    )
    expect(readCustomThemes().map(item => item.id)).toEqual(['c-1'])
  })

  it('坏数据逐条丢弃', () => {
    window.localStorage.setItem(
      `planner:${THEMES_KEY}`,
      JSON.stringify({ v: 1, data: [null, { id: 'x' }, custom('c-1')] }),
    )
    expect(readCustomThemes()).toHaveLength(1)
  })
})

describe('readAllThemes', () => {
  it('预设在前、自定义在后', () => {
    window.localStorage.setItem(
      `planner:${THEMES_KEY}`,
      JSON.stringify({ v: 1, data: [custom('c-1')] }),
    )
    const all = readAllThemes()
    expect(all).toHaveLength(BUILTIN_THEMES.length + 1)
    expect(all[all.length - 1]?.id).toBe('c-1')
  })
})

describe('persistThemeSet', () => {
  it('只写 custom 主题，信封结构不变', () => {
    const result = persistThemeSet([...BUILTIN_THEMES, custom('c-1')])
    expect(result.ok).toBe(true)
    expect(raw(THEMES_KEY)).toEqual([custom('c-1')])
  })

  it('总额超限时拒绝写入且保留旧值', () => {
    window.localStorage.setItem(
      `planner:${THEMES_KEY}`,
      JSON.stringify({ v: 1, data: [custom('keep')] }),
    )
    const huge = Array.from({ length: 3 }, (_, index) =>
      custom(`big-${index}`, { bgImage: `data:image/webp;base64,${'x'.repeat(THEME_IMAGE_MAX_CHARS)}` }),
    )
    const result = persistThemeSet(huge)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('总额')
    expect(raw(THEMES_KEY)).toEqual([custom('keep')])
  })

  it('体积未增长时允许写入（重命名历史超限数据）', () => {
    const legacy = [custom('legacy', { bgImage: `data:image/webp;base64,${'x'.repeat(THEME_IMAGE_MAX_CHARS)}` })]
    window.localStorage.setItem(`planner:${THEMES_KEY}`, JSON.stringify({ v: 1, data: legacy }))
    const result = persistThemeSet([custom('legacy', { name: '改名后', bgImage: legacy[0].bgImage })])
    expect(result.ok).toBe(true)
    expect(raw(THEMES_KEY)).toEqual([custom('legacy', { name: '改名后', bgImage: legacy[0].bgImage })])
  })
})

describe('active theme id', () => {
  it('未设置时回落 blue', () => {
    expect(readActiveThemeId()).toBe('blue')
  })

  it('已删除的主题回落 blue', () => {
    persistActiveThemeId('gone')
    expect(readActiveThemeId()).toBe('blue')
  })

  it('有效 id 原样返回', () => {
    persistActiveThemeId('green')
    expect(readActiveThemeId()).toBe('green')
    expect(raw(ACTIVE_THEME_KEY)).toBe('green')
  })
})
