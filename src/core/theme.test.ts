import { describe, expect, it } from 'vitest'
import { normalizeTheme, normalizeThemeVars, sanitizeBackgroundImage } from './theme'

const base = {
  id: 'c-1',
  name: '自定义',
  primary: '#123456',
  sidebar: '#0f172a',
  bg: '#f0f4f8',
  bgImage: 'https://example.com/a.jpg',
  overlay: 0.9,
  blur: 10,
  custom: true,
  iconSet: 'arc',
  vars: { surface: '#ffffff', cardAlpha: 0.8, texture: 'grid', cut: 12, monoNumbers: true },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
}

describe('normalizeTheme 旧字段保留', () => {
  it('保留 bg / bgImage / overlay / blur / iconSet', () => {
    const theme = normalizeTheme(base)
    expect(theme).toMatchObject({
      id: 'c-1',
      name: '自定义',
      primary: '#123456',
      sidebar: '#0f172a',
      bg: '#f0f4f8',
      bgImage: 'https://example.com/a.jpg',
      overlay: 0.9,
      blur: 10,
      custom: true,
      iconSet: 'arc',
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    })
  })

  it('保留 vars 并把未知枚举过滤掉', () => {
    const theme = normalizeTheme({ ...base, vars: { ...base.vars, texture: 'sparkles' } })
    expect(theme?.vars).toEqual({ surface: '#ffffff', cardAlpha: 0.8, cut: 12, monoNumbers: true })
  })

  it('缺 name / id 直接判废', () => {
    expect(normalizeTheme({ id: '', name: 'x' })).toBeNull()
    expect(normalizeTheme({ id: 'x' })).toBeNull()
    expect(normalizeTheme(null)).toBeNull()
  })

  it('数值字段收敛到合法区间', () => {
    const theme = normalizeTheme({ ...base, overlay: 9, blur: -3 })
    expect(theme?.overlay).toBe(1)
    expect(theme?.blur).toBe(0)
  })
})

describe('sanitizeBackgroundImage', () => {
  it('放行 data:image 与 http/https', () => {
    expect(sanitizeBackgroundImage('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
    expect(sanitizeBackgroundImage('https://example.com/bg.webp')).toBe('https://example.com/bg.webp')
  })

  it('拦截 javascript: / 相对路径 / 空值', () => {
    expect(sanitizeBackgroundImage('javascript:alert(1)')).toBeNull()
    expect(sanitizeBackgroundImage('bg.png')).toBeNull()
    expect(sanitizeBackgroundImage('')).toBeNull()
    expect(sanitizeBackgroundImage(undefined)).toBeNull()
  })

  it('主题里的非法背景图被丢弃', () => {
    const theme = normalizeTheme({ ...base, bgImage: 'javascript:alert(1)' })
    expect(theme?.bgImage).toBeUndefined()
  })
})

describe('normalizeThemeVars', () => {
  it('cardAlpha / cut 夹在区间内，非法值回落默认', () => {
    const vars = normalizeThemeVars({ cardAlpha: 2, cut: 999, monoNumbers: 'yes' })
    expect(vars).toEqual({ cardAlpha: 1, cut: 24 })
  })

  it('非对象返回 undefined', () => {
    expect(normalizeThemeVars(null)).toBeUndefined()
    expect(normalizeThemeVars({})).toBeUndefined()
  })
})
