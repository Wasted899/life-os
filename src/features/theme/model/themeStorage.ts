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

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map(theme => theme.id))

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
  return [...BUILTIN_THEMES, ...readCustomThemes()]
}

/** 当前主题 id；失效（主题已删）时回落默认预设 */
export function readActiveThemeId(): string {
  const stored = load<unknown>(ACTIVE_THEME_KEY, DEFAULT_THEME_ID)
  const id = typeof stored === 'string' ? stored : ''
  return readAllThemes().some(theme => theme.id === id) ? id : DEFAULT_THEME_ID
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
