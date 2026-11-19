import { describe, expect, it } from 'vitest'
import type { Theme } from '../../../core/types'
import {
  buildThemeFromDraft,
  createThemeDraft,
  MIN_CARD_ALPHA_WITH_IMAGE,
  themePreviewBackground,
  themeToCssVars,
} from './themeSchema'

const blue: Theme = {
  id: 'blue',
  name: '深邃蓝',
  primary: '#2563eb',
  sidebar: '#1e3a5f',
  bg: '#f0f4f8',
  overlay: 0.88,
  blur: 12,
  custom: false,
}

describe('themeToCssVars 兼容层', () => {
  it('旧 6 个变量照旧输出', () => {
    const vars = themeToCssVars(blue)
    expect(vars['--primary']).toBe('#2563eb')
    expect(vars['--sidebar-bg']).toBe('#1e3a5f')
    expect(vars['--overlay']).toBe('0.88')
    expect(vars['--blur']).toBe('12px')
    expect(vars['--radius']).toBe('12px')
    expect(vars['--bg-image']).toBe('none')
  })

  it('背景图写入 --bg-image', () => {
    const vars = themeToCssVars({ ...blue, bgImage: 'https://example.com/a.jpg' })
    expect(vars['--bg-image']).toBe('url(https://example.com/a.jpg)')
  })
})

describe('themeToCssVars 新变量', () => {
  it('cardAlpha 缺省沿用 overlay，新变量成对输出', () => {
    const vars = themeToCssVars(blue)
    expect(vars['--card-alpha']).toBe('0.88')
    expect(vars['--sidebar-overlay']).toBe('0.88')
    expect(vars['--card-blur']).toBe('6px')
    expect(vars['--sidebar-blur']).toBe('12px')
    expect(vars['--accent']).toBe('#2563eb')
    expect(vars['--surface']).toBe('#ffffff')
  })

  it('有背景图时 cardAlpha 不低于 0.72', () => {
    const vars = themeToCssVars({
      ...blue,
      bgImage: 'https://example.com/a.jpg',
      vars: { cardAlpha: 0.5 },
    })
    expect(Number(vars['--card-alpha'])).toBe(MIN_CARD_ALPHA_WITH_IMAGE)
  })

  it('质感参数落到对应变量', () => {
    const vars = themeToCssVars({
      ...blue,
      vars: {
        texture: 'both',
        cut: 10,
        monoNumbers: true,
        motion: 'calm',
        accent: '#57c7d4',
        cardAlpha: 0.9,
        sidebarOverlay: 0.7,
      },
    })
    expect(vars['--texture']).toBe('both')
    expect(vars['--grid-alpha']).not.toBe('0')
    expect(vars['--noise-alpha']).not.toBe('0')
    expect(vars['--cut']).toBe('10px')
    expect(vars['--mono-numbers']).toBe('1')
    expect(vars['--motion-base']).toBe('280ms')
    expect(vars['--accent']).toBe('#57c7d4')
    expect(vars['--sidebar-overlay']).toBe('0.7')
  })

  it('texture=none 时网格与噪点归零', () => {
    const vars = themeToCssVars({ ...blue, vars: { texture: 'none' } })
    expect(vars['--grid-alpha']).toBe('0')
    expect(vars['--noise-alpha']).toBe('0')
  })

  it('深色底自动切浅色文字', () => {
    const vars = themeToCssVars({ ...blue, bg: '#1e293b' })
    expect(vars['--text-main']).toBe('#e6edf3')
    expect(vars['--hairline']).toBe('rgba(255,255,255,.14)')
  })

  it('textTone 显式覆盖自动判断', () => {
    const vars = themeToCssVars({ ...blue, bg: '#1e293b', vars: { textTone: 'dark' } })
    expect(vars['--text-main']).toBe('#1e293b')
  })
})

describe('草稿与构建', () => {
  it('createThemeDraft 复制已有主题字段', () => {
    const draft = createThemeDraft(blue)
    expect(draft).toMatchObject({ name: '深邃蓝', primary: '#2563eb', sidebar: '#1e3a5f', bg: '#f0f4f8' })
    expect(draft.bgImage).toBe('')
  })

  it('buildThemeFromDraft 空图不写 bgImage，并刷新 updatedAt', () => {
    const draft = createThemeDraft(blue)
    draft.name = ' 我的主题 '
    const theme = buildThemeFromDraft(draft, { id: 'c-1', createdAt: '2026-01-01', now: '2026-11-19T00:00:00.000Z' })
    expect(theme.name).toBe('我的主题')
    expect(theme.bgImage).toBeUndefined()
    expect(theme.createdAt).toBe('2026-01-01')
    expect(theme.updatedAt).toBe('2026-11-19T00:00:00.000Z')
    expect(theme.custom).toBe(true)
  })

  it('themePreviewBackground 有图用图、无图用渐变', () => {
    expect(themePreviewBackground(blue)).toContain('linear-gradient')
    expect(themePreviewBackground({ ...blue, bgImage: 'https://example.com/a.jpg' })).toBe(
      'url(https://example.com/a.jpg) center/cover',
    )
  })
})
