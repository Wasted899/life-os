/**
 * 主题 → CSS 变量契约（M3-4 T0）
 *
 * 唯一真源：ThemeContext / ThemePanel / index.html 首屏脚本都按这里的映射写变量。
 * 旧 6 个变量（--primary / --sidebar-bg / --overlay / --blur / --radius / --bg-image）
 * 全部保留，作为既有样式的兼容层；新变量由 T4 的质感样式消费。
 */
import type { Theme, ThemeVars } from '../../../core/types'

/** 有背景图时卡片不透明度的下限，避免文字压在花纹上看不清 */
export const MIN_CARD_ALPHA_WITH_IMAGE = 0.72

export type CssVars = Record<string, string>

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const asNumber = (value: unknown, fallback: number): number => {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

/** #rgb / #rrggbb → "r,g,b"；解析失败返回 null */
function hexToRgb(color: string): string | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  const hex = match[1].length === 3
    ? match[1].split('').map(char => char + char).join('')
    : match[1]
  return `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`
}

/** #rgb / #rrggbb → 相对亮度；解析失败返回 null */
function hexLuminance(color: string): number | null {
  const rgb = hexToRgb(color)
  if (!rgb) return null
  const [r, g, b] = rgb.split(',').map(value => Number(value) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const motionTokens = (motion: ThemeVars['motion']): { fast: string; base: string; ease: string } =>
  motion === 'calm'
    ? { fast: '180ms', base: '280ms', ease: 'cubic-bezier(.4,0,.2,1)' }
    : { fast: '120ms', base: '180ms', ease: 'cubic-bezier(.2,.8,.2,1)' }

/**
 * 主题全量 CSS 变量。
 * - overlay 仍写回旧变量，旧样式零改动；
 * - cardAlpha / sidebarOverlay / cut / motion 等新变量在 T4 生效；
 * - 有背景图时 cardAlpha 强制 ≥ 0.72（可用性底线）。
 */
export function themeToCssVars(theme: Theme): CssVars {
  const overlay = clamp(asNumber(theme.overlay, 0.88), 0.3, 1)
  const blur = Math.round(clamp(asNumber(theme.blur, 12), 0, 24))
  const vars = theme.vars ?? {}
  const bg = theme.bg || '#f0f4f8'
  const hasImage = !!theme.bgImage

  const rawCardAlpha = clamp(asNumber(vars.cardAlpha, overlay), 0.5, 1)
  const cardAlpha = hasImage ? Math.max(MIN_CARD_ALPHA_WITH_IMAGE, rawCardAlpha) : rawCardAlpha
  const sidebarOverlay = clamp(asNumber(vars.sidebarOverlay, overlay), 0.3, 1)

  const luminance = hexLuminance(bg)
  const lightText = vars.textTone ? vars.textTone === 'light' : luminance !== null && luminance < 0.45

  const texture = vars.texture ?? 'none'
  const gridOn = texture === 'grid' || texture === 'both'
  const noiseOn = texture === 'noise' || texture === 'both'
  const motion = motionTokens(vars.motion)

  return {
    // ---- 兼容层：旧 6 变量 ----
    '--primary': theme.primary,
    '--sidebar-bg': theme.sidebar,
    '--overlay': String(overlay),
    '--blur': `${blur}px`,
    '--radius': '12px',
    '--bg-image': hasImage ? `url(${theme.bgImage})` : 'none',

    // ---- 新变量：T4 质感消费 ----
    '--bg': bg,
    '--bg-rgb': hexToRgb(bg) || '240,244,248',
    '--sidebar-rgb': hexToRgb(theme.sidebar) || '30,58,95',
    '--surface': vars.surface || '#ffffff',
    '--surface-rgb': hexToRgb(vars.surface || '#ffffff') || '255,255,255',
    '--pattern-rgb': lightText ? '255,255,255' : '15,23,42',
    '--accent': vars.accent || theme.primary,
    '--card-alpha': String(cardAlpha),
    '--card-blur': `${Math.round(blur * 0.5)}px`,
    '--sidebar-overlay': String(sidebarOverlay),
    '--sidebar-blur': `${blur}px`,
    '--texture': texture,
    '--grid-size': '24px',
    '--grid-alpha': gridOn ? '0.06' : '0',
    '--noise-alpha': noiseOn ? '0.035' : '0',
    '--cut': `${Math.round(clamp(asNumber(vars.cut, 0), 0, 24))}px`,
    '--mono-numbers': vars.monoNumbers ? '1' : '0',
    '--motion-fast': motion.fast,
    '--motion-base': motion.base,
    '--motion-ease': motion.ease,
    '--grad-start': theme.primary,
    '--grad-end': vars.accent || theme.sidebar,
    '--hairline': lightText ? 'rgba(255,255,255,.14)' : 'rgba(15,23,42,.09)',
    '--text-main': lightText ? '#e6edf3' : '#1e293b',
    '--text-muted': lightText ? 'rgba(230,237,243,.72)' : '#64748b',
    '--text-faint': lightText ? 'rgba(230,237,243,.5)' : '#94a3b8',
  }
}

/** 主题卡片预览背景（不参与真实注入，只用于面板缩略图） */
export function themePreviewBackground(theme: Theme): string {
  if (theme.bgImage) return `url(${theme.bgImage}) center/cover`
  return `linear-gradient(135deg, ${theme.sidebar} 0%, ${theme.primary} 100%)`
}

export interface ThemeDraft {
  name: string
  primary: string
  sidebar: string
  bg: string
  bgImage: string
  overlay: number
  blur: number
  vars: ThemeVars
}

const emptyVars: ThemeVars = {}

/** 编辑已有主题 / 新建主题时的草稿（bgImage 用空串表示无图） */
export function createThemeDraft(base?: Theme | null): ThemeDraft {
  if (!base) {
    return {
      name: '',
      primary: '#2563eb',
      sidebar: '#1e3a5f',
      bg: '#f0f4f8',
      bgImage: '',
      overlay: 0.88,
      blur: 12,
      vars: { ...emptyVars },
    }
  }
  return {
    name: base.name,
    primary: base.primary,
    sidebar: base.sidebar,
    bg: base.bg || '#f0f4f8',
    bgImage: base.bgImage || '',
    overlay: clamp(asNumber(base.overlay, 0.88), 0.3, 1),
    blur: Math.round(clamp(asNumber(base.blur, 12), 0, 24)),
    vars: { ...(base.vars ?? {}) },
  }
}

export interface BuildThemeOptions {
  id: string
  custom?: boolean
  createdAt?: string
  now?: string
}

/** 草稿 → 持久化主题。createdAt 沿用旧值，updatedAt 每次构建刷新 */
export function buildThemeFromDraft(draft: ThemeDraft, options: BuildThemeOptions): Theme {
  const now = options.now ?? new Date().toISOString()
  const theme: Theme = {
    id: options.id,
    name: draft.name.trim(),
    primary: draft.primary,
    sidebar: draft.sidebar,
    bg: draft.bg,
    overlay: clamp(draft.overlay, 0.3, 1),
    blur: Math.round(clamp(draft.blur, 0, 24)),
    custom: options.custom !== false,
    createdAt: options.createdAt,
    updatedAt: now,
  }
  if (draft.bgImage) theme.bgImage = draft.bgImage
  if (Object.keys(draft.vars).length) theme.vars = { ...draft.vars }
  return theme
}
