/**
 * 主题 → CSS 变量契约（M3-4 T0）
 *
 * 唯一真源：ThemeContext / ThemePanel / index.html 首屏脚本都按这里的映射写变量。
 * 旧 6 个变量（--primary / --sidebar-bg / --overlay / --blur / --radius / --bg-image）
 * 全部保留，作为既有样式的兼容层；新变量由 T4 的质感样式消费。
 */
import type { Theme, ThemeVars } from '../../../core/types'

/** 有背景图时卡片不透明度的下限：再低会看不清文字，0.62 配合毛玻璃已足够通透 */
export const MIN_CARD_ALPHA_WITH_IMAGE = 0.62

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

/** 与黑色混合：浅色霓虹在浅底上做文字/描边时的降饱和方案 */
function darken(color: string, ratio: number): string {
  const rgb = hexToRgb(color)
  if (!rgb) return color
  const [r, g, b] = rgb.split(',').map(Number)
  const mix = (value: number) => Math.round(value * ratio).toString(16).padStart(2, '0')
  return `#${mix(r)}${mix(g)}${mix(b)}`
}

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif'
/** 高对比标题：系统自带的重型无衬线，不打包字体 */
const IMPACT_FONT = 'Impact, "Arial Black", "Arial Narrow Bold", "Haettenschweiler", sans-serif'

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
  const storedSidebarOverlay = clamp(asNumber(vars.sidebarOverlay, overlay), 0.3, 1)
  // 背景图模式：侧栏放弃原色，改用中性深色玻璃，让背景图色调透出来而不是贴一块色块
  const sidebarOverlay = hasImage ? clamp(storedSidebarOverlay, 0.34, 0.58) : storedSidebarOverlay

  const luminance = hexLuminance(bg)
  const lightText = vars.textTone ? vars.textTone === 'light' : luminance !== null && luminance < 0.45

  const texture = vars.texture ?? 'none'
  const gridOn = texture === 'grid' || texture === 'both'
  const noiseOn = texture === 'noise' || texture === 'both'
  const stripeOn = texture === 'stripes'
  const motion = motionTokens(vars.motion)

  const cut = Math.round(clamp(asNumber(vars.cut, 0), 0, 24))
  /** 有斜切角即视为几何风格：粗边色块、直角、Impact 标题 */
  const geometric = cut > 0
  const surface = vars.surface || '#ffffff'
  const primaryLum = hexLuminance(theme.primary)
  const surfaceLum = hexLuminance(surface)
  // 霓虹黄这类高亮主色必须配深色文字，否则 AA 直接失守
  const onPrimary = primaryLum !== null && primaryLum > 0.55 ? '#0a0a0a' : '#ffffff'
  // 浅底 + 浅主色时，文字/描边改用压暗版本，保证看得见
  const primaryInk =
    surfaceLum !== null && surfaceLum > 0.5 && primaryLum !== null && primaryLum > 0.45
      ? darken(theme.primary, 0.42)
      : theme.primary

  return {
    // ---- 兼容层：旧 6 变量 ----
    '--primary': theme.primary,
    '--sidebar-bg': theme.sidebar,
    '--overlay': String(overlay),
    '--blur': `${blur}px`,
    '--radius': geometric ? '2px' : '12px',
    '--bg-image': hasImage ? `url(${theme.bgImage})` : 'none',

    // ---- 新变量：质感消费 ----
    '--bg': bg,
    '--bg-rgb': hexToRgb(bg) || '240,244,248',
    '--sidebar-rgb': hexToRgb(theme.sidebar) || '30,58,95',
    // 有背景图时侧栏用中性黑玻璃，无图时保持侧栏原色
    '--sidebar-glass-rgb': hasImage ? '8,8,10' : (hexToRgb(theme.sidebar) || '30,58,95'),
    '--surface': surface,
    '--surface-rgb': hexToRgb(surface) || '255,255,255',
    '--pattern-rgb': lightText ? '255,255,255' : '15,23,42',
    '--on-primary': onPrimary,
    '--primary-ink': primaryInk,
    '--accent': vars.accent || theme.primary,
    '--card-alpha': String(cardAlpha),
    '--card-blur': `${hasImage ? Math.max(10, Math.round(blur * 0.75)) : Math.round(blur * 0.5)}px`,
    '--sidebar-overlay': String(sidebarOverlay),
    '--sidebar-blur': `${hasImage ? Math.max(14, blur) : blur}px`,
    '--texture': texture,
    '--grid-size': '24px',
    '--grid-alpha': gridOn ? '0.06' : '0',
    '--noise-alpha': noiseOn ? '0.035' : '0',
    '--stripe-alpha': stripeOn ? '0.055' : '0',
    '--cut': `${cut}px`,
    '--card-clip': geometric
      ? `polygon(0 0,calc(100% - ${cut}px) 0,100% ${cut}px,100% 100%,${cut}px 100%,0 calc(100% - ${cut}px))`
      : 'none',
    '--btn-clip': geometric
      ? `polygon(0 0,calc(100% - ${Math.min(cut, 12)}px) 0,100% ${Math.min(cut, 12)}px,100% 100%,0 100%)`
      : 'none',
    '--sidebar-clip': geometric
      ? `polygon(0 0,100% 0,100% calc(100% - ${cut * 2}px),calc(100% - ${cut * 2}px) 100%,0 100%)`
      : 'none',
    '--card-edge': geometric ? '0px' : '1px',
    '--accent-block': geometric ? '4px' : '2px',
    '--field-border': geometric ? '2px' : '1px',
    // 圆角规范：大卡片 / 小卡片与控件 / 按钮，三档全部变量化
    '--radius-card': geometric ? '2px' : '14px',
    '--radius-control': geometric ? '2px' : '10px',
    '--radius-btn': geometric ? '2px' : '8px',
    // 去重阴影：只留 1px 极浅边框 + 几乎没有的弥散
    '--shadow-card': geometric ? 'none' : '0 1px 2px rgba(15,23,42,.05)',
    '--card-pad': geometric ? '20px' : '24px',
    '--title-size': geometric ? '20px' : '18px',
    '--text-strong': lightText ? '#ffffff' : '#0f172a',
    '--font-body': SYSTEM_FONT,
    '--font-display': vars.heading === 'impact' ? IMPACT_FONT : SYSTEM_FONT,
    '--glitch-shadow': vars.glitch
      ? '2px 0 rgba(34,211,238,.65), -2px 0 rgba(244,114,182,.65)'
      : 'none',
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
