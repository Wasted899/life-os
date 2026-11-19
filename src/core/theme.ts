/**
 * 主题数据契约与归一（M3-4）
 *
 * 放在 core 层的原因：migrate（导入导出）与 features/theme（面板/注入）共用同一份规则，
 * 避免两边各写一套导致旧主题字段在导入时被静默丢弃。
 */
import type { Theme, ThemeVars } from './types'
import { sanitizeExternalUrl } from '../lib/externalUrl'

export const DEFAULT_THEME_ID = 'blue'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

/** 背景图只接受本地 data:image 或 http/https 绝对地址，拒绝 javascript:/相对路径 */
export function sanitizeBackgroundImage(raw: unknown): string | null {
  const text = asText(raw)
  if (!text) return null
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(text)) return text
  return sanitizeExternalUrl(text)
}

const TEXTURES = new Set(['none', 'grid', 'noise', 'both'])
const MOTIONS = new Set(['snappy', 'calm'])
const TEXT_TONES = new Set(['dark', 'light'])

export function normalizeThemeVars(raw: unknown): ThemeVars | undefined {
  if (!isPlainObject(raw)) return undefined
  const vars: ThemeVars = {}
  const surface = asText(raw.surface)
  if (surface) vars.surface = surface
  const accent = asText(raw.accent)
  if (accent) vars.accent = accent
  if (raw.cardAlpha !== undefined) vars.cardAlpha = clamp(raw.cardAlpha, 0.5, 1, 0.88)
  if (raw.sidebarOverlay !== undefined) vars.sidebarOverlay = clamp(raw.sidebarOverlay, 0.3, 1, 0.88)
  if (typeof raw.texture === 'string' && TEXTURES.has(raw.texture)) {
    vars.texture = raw.texture as ThemeVars['texture']
  }
  if (raw.cut !== undefined) vars.cut = clamp(raw.cut, 0, 24, 10)
  if (typeof raw.monoNumbers === 'boolean') vars.monoNumbers = raw.monoNumbers
  if (typeof raw.motion === 'string' && MOTIONS.has(raw.motion)) {
    vars.motion = raw.motion as ThemeVars['motion']
  }
  if (typeof raw.textTone === 'string' && TEXT_TONES.has(raw.textTone)) {
    vars.textTone = raw.textTone as ThemeVars['textTone']
  }
  return Object.keys(vars).length ? vars : undefined
}

/**
 * 单条主题归一。旧字段（primary/sidebar/bg/bgImage/overlay/blur/iconSet）
 * 全部保留，新字段 vars 做白名单校验；未知字段仍按 migrate 约定丢弃。
 */
export function normalizeTheme(item: unknown): Theme | null {
  if (!isPlainObject(item)) return null
  const id = asText(item.id)
  const name = asText(item.name)
  if (!id || !name) return null

  const theme: Theme = {
    id,
    name,
    primary: asText(item.primary) || '#2563eb',
    sidebar: asText(item.sidebar) || '#1e3a5f',
    custom: item.custom !== false,
  }
  const bg = asText(item.bg)
  if (bg) theme.bg = bg
  const bgImage = sanitizeBackgroundImage(item.bgImage)
  if (bgImage) theme.bgImage = bgImage
  if (item.overlay !== undefined) theme.overlay = clamp(item.overlay, 0.3, 1, 0.88)
  if (item.blur !== undefined) theme.blur = clamp(item.blur, 0, 24, 12)
  const iconSet = asText(item.iconSet)
  if (iconSet) theme.iconSet = iconSet
  const vars = normalizeThemeVars(item.vars)
  if (vars) theme.vars = vars
  const createdAt = asText(item.createdAt)
  if (createdAt) theme.createdAt = createdAt
  const updatedAt = asText(item.updatedAt)
  if (updatedAt) theme.updatedAt = updatedAt
  return theme
}
