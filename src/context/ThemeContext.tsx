import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from '../core/types'
import { DEFAULT_THEME_ID } from '../core/theme'
import { applyTheme } from '../features/theme/applyTheme'
import { BUILTIN_THEMES } from '../features/theme/builtinThemes'
import {
  persistActiveThemeId,
  persistHiddenThemeIds,
  persistThemeSet,
  readActiveThemeId,
  readAllThemes,
  readHiddenThemeIds,
} from '../features/theme/model/themeStorage'
import type { PersistResult } from '../features/theme/model/themeStorage'

export type { Theme }

interface ThemeContextValue {
  theme: Theme
  themes: Theme[]
  /** 被用户删除（隐藏）的内置预设，可恢复 */
  hiddenPresets: Theme[]
  setTheme: (id: string) => void
  /** 新增自定义主题并切换；写失败时内存状态不变 */
  addTheme: (theme: Theme) => PersistResult
  /** 覆盖已有自定义主题（重命名 / 换配色）；写失败时内存状态不变 */
  updateTheme: (theme: Theme) => PersistResult
  renameTheme: (id: string, name: string) => PersistResult
  /** 删除自定义主题或隐藏内置预设；删的是当前主题时自动回落 */
  deleteTheme: (id: string) => PersistResult
  /** 恢复被隐藏的内置预设 */
  restorePreset: (id: string) => PersistResult
}

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map(theme => theme.id))

const previewTheme = BUILTIN_THEMES[0]

/** 删除/隐藏当前主题后的回落顺序：默认预设 → 第一个可用主题 */
const pickFallback = (list: readonly Theme[]): string => {
  if (list.some(theme => theme.id === DEFAULT_THEME_ID)) return DEFAULT_THEME_ID
  return list[0]?.id ?? DEFAULT_THEME_ID
}

const C = createContext<ThemeContextValue>({
  theme: previewTheme,
  themes: [...BUILTIN_THEMES],
  hiddenPresets: [],
  setTheme: () => {},
  addTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
  updateTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
  renameTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
  deleteTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
  restorePreset: () => ({ ok: false, reason: '主题上下文未初始化' }),
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themes, setThemes] = useState<Theme[]>(() => readAllThemes())
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => readHiddenThemeIds())
  const [tid, setTid] = useState<string>(() => readActiveThemeId())

  const theme = themes.find(item => item.id === tid) || themes[0] || previewTheme

  // useLayoutEffect：在任何一次绘制之前写变量，和 index.html 首屏脚本衔接，避免闪烁
  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((id: string) => {
    setTid(current => (current === id ? current : id))
    persistActiveThemeId(id)
  }, [])

  /** 统一先落盘再更新内存：写失败时状态不变，界面不会出现「看起来保存了其实丢了」 */
  const commit = useCallback((next: Theme[]): PersistResult => {
    const result = persistThemeSet(next)
    if (result.ok) setThemes(next)
    return result
  }, [])

  const addTheme = useCallback(
    (themeToAdd: Theme): PersistResult => {
      const next = [...themes.filter(item => item.id !== themeToAdd.id), themeToAdd]
      const result = commit(next)
      if (result.ok) {
        setTid(themeToAdd.id)
        persistActiveThemeId(themeToAdd.id)
      }
      return result
    },
    [commit, themes],
  )

  const updateTheme = useCallback(
    (nextTheme: Theme): PersistResult => {
      if (BUILTIN_IDS.has(nextTheme.id)) {
        return { ok: false, reason: '预设主题不可修改' }
      }
      const next = themes.map(item => (item.id === nextTheme.id ? nextTheme : item))
      return commit(next)
    },
    [commit, themes],
  )

  const renameTheme = useCallback(
    (id: string, name: string): PersistResult => {
      const target = themes.find(item => item.id === id)
      if (!target) return { ok: false, reason: '主题不存在' }
      if (BUILTIN_IDS.has(id)) return { ok: false, reason: '预设主题不可重命名' }
      const trimmed = name.trim()
      if (!trimmed) return { ok: false, reason: '主题名称不能为空' }
      return updateTheme({ ...target, name: trimmed, updatedAt: new Date().toISOString() })
    },
    [themes, updateTheme],
  )

  const deleteTheme = useCallback(
    (id: string): PersistResult => {
      const target = themes.find(item => item.id === id)
      if (!target) return { ok: false, reason: '主题不存在' }
      // 至少保留一个可用主题，避免删空后界面无主题可回落
      if (themes.length <= 1) return { ok: false, reason: '至少保留一个主题' }

      if (BUILTIN_IDS.has(id)) {
        // 预设本体是代码常量，删除 = 把 id 记进隐藏名单，刷新后仍然保持删除状态
        const nextHidden = [...hiddenIds, id]
        if (!persistHiddenThemeIds(nextHidden)) {
          return { ok: false, reason: '本地存储写入失败，请清理浏览器空间后重试' }
        }
        const next = themes.filter(item => item.id !== id)
        setThemes(next)
        setHiddenIds(nextHidden)
        if (tid === id) {
          const fallback = pickFallback(next)
          setTid(fallback)
          persistActiveThemeId(fallback)
        }
        return { ok: true }
      }

      const result = commit(themes.filter(item => item.id !== id))
      if (result.ok && tid === id) {
        const fallback = pickFallback(themes.filter(item => item.id !== id))
        setTid(fallback)
        persistActiveThemeId(fallback)
      }
      return result
    },
    [commit, hiddenIds, themes, tid],
  )

  const restorePreset = useCallback(
    (id: string): PersistResult => {
      if (!BUILTIN_IDS.has(id)) return { ok: false, reason: '不是内置预设' }
      if (!hiddenIds.includes(id)) return { ok: false, reason: '该预设未被隐藏' }
      const nextHidden = hiddenIds.filter(item => item !== id)
      if (!persistHiddenThemeIds(nextHidden)) {
        return { ok: false, reason: '本地存储写入失败，请清理浏览器空间后重试' }
      }
      const customs = themes.filter(item => item.custom)
      setThemes([...BUILTIN_THEMES.filter(item => !nextHidden.includes(item.id)), ...customs])
      setHiddenIds(nextHidden)
      return { ok: true }
    },
    [hiddenIds, themes],
  )

  const hiddenPresets = useMemo(
    () => BUILTIN_THEMES.filter(item => hiddenIds.includes(item.id)),
    [hiddenIds],
  )

  const value = useMemo(
    () => ({ theme, themes, hiddenPresets, setTheme, addTheme, updateTheme, renameTheme, deleteTheme, restorePreset }),
    [theme, themes, hiddenPresets, setTheme, addTheme, updateTheme, renameTheme, deleteTheme, restorePreset],
  )

  return <C.Provider value={value}>{children}</C.Provider>
}

export const useTheme = () => useContext(C)
