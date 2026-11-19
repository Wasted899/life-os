import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from '../core/types'
import { DEFAULT_THEME_ID } from '../core/theme'
import { applyTheme } from '../features/theme/applyTheme'
import { BUILTIN_THEMES } from '../features/theme/builtinThemes'
import {
  persistActiveThemeId,
  persistThemeSet,
  readActiveThemeId,
  readAllThemes,
} from '../features/theme/model/themeStorage'
import type { PersistResult } from '../features/theme/model/themeStorage'

export type { Theme }

interface ThemeContextValue {
  theme: Theme
  themes: Theme[]
  setTheme: (id: string) => void
  /** 新增自定义主题并切换；写失败时内存状态不变 */
  addTheme: (theme: Theme) => PersistResult
  /** 覆盖已有自定义主题（重命名 / 换配色）；写失败时内存状态不变 */
  updateTheme: (theme: Theme) => PersistResult
  renameTheme: (id: string, name: string) => PersistResult
  deleteTheme: (id: string) => PersistResult
}

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map(theme => theme.id))

const previewTheme = BUILTIN_THEMES[0]

const C = createContext<ThemeContextValue>({
  theme: previewTheme,
  themes: [...BUILTIN_THEMES],
  setTheme: () => {},
  addTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
  updateTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
  renameTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
  deleteTheme: () => ({ ok: false, reason: '主题上下文未初始化' }),
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themes, setThemes] = useState<Theme[]>(() => readAllThemes())
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
      if (BUILTIN_IDS.has(id)) return { ok: false, reason: '预设主题不可删除' }
      const target = themes.find(item => item.id === id)
      if (!target) return { ok: false, reason: '主题不存在' }
      const result = commit(themes.filter(item => item.id !== id))
      if (result.ok && tid === id) {
        setTid(DEFAULT_THEME_ID)
        persistActiveThemeId(DEFAULT_THEME_ID)
      }
      return result
    },
    [commit, themes, tid],
  )

  const value = useMemo(
    () => ({ theme, themes, setTheme, addTheme, updateTheme, renameTheme, deleteTheme }),
    [theme, themes, setTheme, addTheme, updateTheme, renameTheme, deleteTheme],
  )

  return <C.Provider value={value}>{children}</C.Provider>
}

export const useTheme = () => useContext(C)
