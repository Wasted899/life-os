/**
 * 主题持久化（M3-4 T0/T3）
 *
 * 约定：
 * - 只把 custom 主题写进 p_themes；预设只存在代码里，永不入库。
 * - 写入前做「总额预算 + 配额探针」，任何一步失败都不破坏旧值。
 * - 历史数据已经超限时只允许「体积不变或变小」的写入，避免重命名/删除被误拦。
 */
import type { Theme } from '../../../core/types'
import { load, save } from '../../../core/storage'
import { DEFAULT_THEME_ID, normalizeTheme } from '../../../core/theme'
import { BUILTIN_THEMES } from '../builtinThemes'
import {
  probeQuota,
  themeSetChars,
  THEME_TOTAL_MAX_CHARS,
} from './imagePipeline'

export const THEMES_KEY = 'p_themes'
export const ACTIVE_THEME_KEY = 'p_theme'
/** 被用户删除（隐藏）的内置预设 id；预设本体仍在代码里，靠这份名单决定是否展示 */
export const HIDDEN_THEMES_KEY = 'p_hidden_themes'

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map(theme => theme.id))

/** 历史预设 id → 现 id（改过名的预设不能把老用户的当前主题打回默认） */
const LEGACY_PRESET_IDS: Record<string, string> = { eridu: 'neon' }

/** 读取被隐藏的预设 id：只认当前仍存在的预设，脏数据直接丢弃 */
export function readHiddenThemeIds(): string[] {
  const raw = load<unknown>(HIDDEN_THEMES_KEY, [])
  if (!Array.isArray(raw)) return []
  const ids = raw.filter((id): id is string => typeof id === 'string' && BUILTIN_IDS.has(id))
  return Array.from(new Set(ids))
}

export function persistHiddenThemeIds(ids: readonly string[]): boolean {
  return save(HIDDEN_THEMES_KEY, Array.from(new Set(ids.filter(id => BUILTIN_IDS.has(id)))))
}

/** 读取自定义主题；坏数据逐条丢弃，id 与预设冲突的直接跳过（预设不可被覆盖） */
export function readCustomThemes(): Theme[] {
  const raw = load<unknown>(THEMES_KEY, [])
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: Theme[] = []
  for (const item of raw) {
    const theme = normalizeTheme(item)
    if (!theme || !theme.custom) continue
    if (BUILTIN_IDS.has(theme.id) || seen.has(theme.id)) continue
    seen.add(theme.id)
    list.push(theme)
  }
  return list
}

export function readAllThemes(): Theme[] {
  const hidden = new Set(readHiddenThemeIds())
  return [...BUILTIN_THEMES.filter(theme => !hidden.has(theme.id)), ...readCustomThemes()]
}

/** 当前主题 id；已删除/已隐藏/非法 id 时回落默认预设（默认也被隐藏则取第一个可用主题） */
export function readActiveThemeId(): string {
  const stored = load<unknown>(ACTIVE_THEME_KEY, DEFAULT_THEME_ID)
  const rawId = typeof stored === 'string' ? stored : ''
  const id = LEGACY_PRESET_IDS[rawId] ?? rawId
  const all = readAllThemes()
  if (all.some(theme => theme.id === id)) return id
  return all.some(theme => theme.id === DEFAULT_THEME_ID) ? DEFAULT_THEME_ID : (all[0]?.id ?? DEFAULT_THEME_ID)
}

export interface PersistResult {
  ok: boolean
  reason?: string
  size?: number
}

/**
 * 写入自定义主题集合。
 * @param themes 内存中的完整主题列表（含预设），内部只落 custom
 */
export function persistThemeSet(themes: readonly Theme[]): PersistResult {
  const payload = themes.filter(theme => theme.custom && !BUILTIN_IDS.has(theme.id))
  const nextSize = themeSetChars(payload)
  const storedSize = themeSetChars(readCustomThemes())

  // 只有体积增长时才校验预算：历史超限数据仍允许重命名 / 删减
  if (nextSize > storedSize) {
    if (nextSize > THEME_TOTAL_MAX_CHARS) {
      return { ok: false, size: nextSize, reason: '自定义主题总额超过 250 万字符，请先删除旧主题或压缩背景图' }
    }
    if (!probeQuota(nextSize - storedSize)) {
      return { ok: false, size: nextSize, reason: '浏览器存储空间不足，请删除旧主题或换一张更小的背景图' }
    }
  }

  if (!save(THEMES_KEY, payload)) {
    return { ok: false, size: nextSize, reason: '本地存储写入失败，请清理浏览器空间后重试' }
  }
  return { ok: true, size: nextSize }
}

export function persistActiveThemeId(id: string): boolean {
  return save(ACTIVE_THEME_KEY, id)
}
