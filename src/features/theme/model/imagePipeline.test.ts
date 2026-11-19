import { describe, expect, it } from 'vitest'
import type { Theme } from '../../../core/types'
import {
  COMPRESSION_STEPS,
  checkThemeSetBudget,
  oversizeThemeIds,
  pickWithinBudget,
  scaledSize,
  themeImageChars,
  themeSetChars,
  THEME_IMAGE_MAX_CHARS,
  THEME_SET_MAX_CHARS,
  THEME_TOTAL_MAX_CHARS,
} from './imagePipeline'

const theme = (id: string, bgImage?: string): Theme => ({
  id,
  name: id,
  primary: '#2563eb',
  sidebar: '#1e3a5f',
  bgImage,
  custom: true,
})

describe('scaledSize', () => {
  it('长边超过上限时等比缩小', () => {
    expect(scaledSize(4000, 2000, 1920)).toEqual({ width: 1920, height: 960 })
    expect(scaledSize(2000, 4000, 1600)).toEqual({ width: 800, height: 1600 })
  })

  it('长边未超限不放大', () => {
    expect(scaledSize(800, 600, 1920)).toEqual({ width: 800, height: 600 })
  })

  it('极端值不产生 0 尺寸', () => {
    expect(scaledSize(0, 100, 1920)).toEqual({ width: 1, height: 100 })
  })
})

describe('pickWithinBudget', () => {
  it('按顺序取第一个达标结果', () => {
    const picked = pickWithinBudget(['x'.repeat(900), 'x'.repeat(100), 'x'.repeat(50)], 200)
    expect(picked).toEqual({ value: 'x'.repeat(100), step: 1 })
  })

  it('全部超限返回 null', () => {
    expect(pickWithinBudget(['x'.repeat(300)], 200)).toBeNull()
  })
})

describe('checkThemeSetBudget', () => {
  it('正常主题通过', () => {
    const check = checkThemeSetBudget([], theme('a'))
    expect(check.ok).toBe(true)
    expect(check.size).toBe(themeSetChars([theme('a')]))
  })

  it(`单套超过 ${THEME_SET_MAX_CHARS} 字符被拒`, () => {
    const check = checkThemeSetBudget([], theme('big', 'x'.repeat(THEME_SET_MAX_CHARS)))
    expect(check.ok).toBe(false)
    expect(check.reason).toContain('单套主题')
  })

  it(`多套合计超过 ${THEME_TOTAL_MAX_CHARS} 字符被拒`, () => {
    const existing = [
      theme('a', 'x'.repeat(THEME_IMAGE_MAX_CHARS)),
      theme('b', 'x'.repeat(THEME_IMAGE_MAX_CHARS)),
      theme('c', 'x'.repeat(THEME_IMAGE_MAX_CHARS)),
    ]
    const check = checkThemeSetBudget(existing, theme('d'))
    expect(check.ok).toBe(false)
    expect(check.reason).toContain('总额')
  })

  it('同 id 更新按替换计算', () => {
    const list = [theme('a')]
    expect(checkThemeSetBudget(list, theme('a')).size).toBe(themeSetChars([theme('a')]))
  })
})

describe('oversizeThemeIds', () => {
  it('只标出历史超限主题', () => {
    const list = [
      theme('ok', 'x'.repeat(10)),
      theme('big', 'x'.repeat(THEME_IMAGE_MAX_CHARS + 1)),
      theme('none'),
    ]
    expect(oversizeThemeIds(list)).toEqual(['big'])
    expect(themeImageChars(list[2])).toBe(0)
  })
})

describe('压缩阶梯', () => {
  it('五档递减且质量单调不升', () => {
    expect(COMPRESSION_STEPS).toHaveLength(5)
    const edges = COMPRESSION_STEPS.map(step => step.maxEdge)
    expect(edges).toEqual([...edges].sort((a, b) => b - a))
    const qualities = COMPRESSION_STEPS.map(step => step.quality)
    expect(qualities).toEqual([...qualities].sort((a, b) => b - a))
  })
})
