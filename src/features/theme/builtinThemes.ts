import type { Theme } from '../../core/types'

/** 预设主题：只存在于代码，永远不写入 p_themes，不可删除、不可覆盖 */
export const BUILTIN_THEMES: readonly Theme[] = [
  { id: 'blue', name: '深邃蓝', primary: '#2563eb', sidebar: '#1e3a5f', bg: '#f0f4f8', overlay: 0.88, blur: 12, custom: false },
  { id: 'green', name: '清新绿', primary: '#047857', sidebar: '#065f46', bg: '#f0fdf4', overlay: 0.88, blur: 12, custom: false },
  { id: 'purple', name: '优雅紫', primary: '#7c3aed', sidebar: '#4c1d95', bg: '#faf5ff', overlay: 0.88, blur: 12, custom: false },
  {
    id: 'dark',
    name: '暗夜黑',
    primary: '#6366f1',
    sidebar: '#0f172a',
    bg: '#1e293b',
    overlay: 0.85,
    blur: 16,
    custom: false,
    vars: { surface: '#1e293b', cardAlpha: 0.92 },
  },
  {
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
      cardAlpha: 0.94,
      sidebarOverlay: 0.96,
      texture: 'stripes',
      accent: '#22D3EE',
      cut: 14,
      monoNumbers: true,
      motion: 'snappy',
      textTone: 'light',
      heading: 'impact',
      glitch: true,
    },
  },
]

export const DEFAULT_THEME_ID = 'blue'
