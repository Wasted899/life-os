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

describe('绝区零风格变量（新艾利都）', () => {
  const eridu: Theme = {
    id: 'eridu',
    name: '新艾利都',
    primary: '#FDE047',
    sidebar: '#0B0B0F',
    bg: '#101014',
    overlay: 0.92,
    blur: 10,
    custom: false,
    vars: {
      surface: '#1A1A21',
      texture: 'stripes',
      accent: '#22D3EE',
      cut: 14,
      monoNumbers: true,
      motion: 'snappy',
      textTone: 'light',
      heading: 'impact',
      glitch: true,
    },
  }

  it('霓虹黄主色自动配深色前景，避免按钮白字失守 AA', () => {
    expect(themeToCssVars(eridu)['--on-primary']).toBe('#0a0a0a')
    expect(themeToCssVars(blue)['--on-primary']).toBe('#ffffff')
  })

  it('浅底 + 浅主色时把主色压暗给文字/描边用', () => {
    const ink = themeToCssVars({ ...blue, primary: '#FDE047' })['--primary-ink']
    expect(ink).not.toBe('#FDE047')
    expect(ink).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('cut>0 输出斜切裁剪与几何粗边', () => {
    const vars = themeToCssVars(eridu)
    expect(vars['--radius']).toBe('2px')
    expect(vars['--card-clip']).toContain('polygon(')
    expect(vars['--btn-clip']).toContain('polygon(')
    expect(vars['--sidebar-clip']).toContain('polygon(')
    expect(vars['--card-edge']).toBe('0px')
    expect(vars['--accent-block']).toBe('4px')
  })

  it('cut=0 时全部回落 none，旧主题不被裁剪', () => {
    const vars = themeToCssVars({ ...blue, vars: { cut: 0 } })
    expect(vars['--card-clip']).toBe('none')
    expect(vars['--btn-clip']).toBe('none')
    expect(vars['--sidebar-clip']).toBe('none')
    expect(vars['--accent-block']).toBe('2px')
  })

  it('斜纹质感、Impact 标题、Glitch 阴影与系统字体栈', () => {
    const vars = themeToCssVars(eridu)
    expect(Number(vars['--stripe-alpha'])).toBeGreaterThan(0)
    expect(vars['--grid-alpha']).toBe('0')
    expect(vars['--font-display']).toContain('Impact')
    expect(vars['--font-body']).toContain('system-ui')
    expect(vars['--glitch-shadow']).not.toBe('none')
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
