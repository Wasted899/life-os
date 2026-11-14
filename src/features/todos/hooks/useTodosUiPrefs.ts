import {useCallback,useEffect,useState} from 'react'
import {load,save} from '../../../core/storage'
import {DEFAULT_UI_PREFS} from '../types'
import type {TodoUiPrefs} from '../types'

/** 只存 UI 偏好：不能进 13 域，否则会被云同步、导出、迁移全部带上 */
const UI_PREFS_KEY = 'todos:ui'

const VIEWS = ['list', 'board', 'timeline']
const GROUPS = ['status', 'list', 'category', 'none']
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** 存储可能被旧版本/手工修改污染，读出来先做形状校验 */
function normalizePrefs(raw: unknown): TodoUiPrefs {
  if (!isRecord(raw)) return {...DEFAULT_UI_PREFS}
  const collapsed: Record<string, boolean> = {}
  if (isRecord(raw.collapsed)) {
    Object.entries(raw.collapsed).forEach(([key, value]) => {
      if (typeof value === 'boolean') collapsed[key] = value
    })
  }
  return {
    view: VIEWS.includes(raw.view as string) ? (raw.view as TodoUiPrefs['view']) : DEFAULT_UI_PREFS.view,
    activeList: typeof raw.activeList === 'string' && raw.activeList ? raw.activeList : DEFAULT_UI_PREFS.activeList,
    groupBy: GROUPS.includes(raw.groupBy as string) ? (raw.groupBy as TodoUiPrefs['groupBy']) : DEFAULT_UI_PREFS.groupBy,
    collapsed,
  }
}

export function useTodosUiPrefs() {
  const [prefs, setPrefs] = useState<TodoUiPrefs>(() => normalizePrefs(load<unknown>(UI_PREFS_KEY, DEFAULT_UI_PREFS)))

  useEffect(() => {
    save(UI_PREFS_KEY, prefs)
  }, [prefs])

  const patch = useCallback((next: Partial<TodoUiPrefs>) => {
    setPrefs(prev => ({...prev, ...next}))
  }, [])

  const toggleCollapse = useCallback((key: string) => {
    setPrefs(prev => ({...prev, collapsed: {...prev.collapsed, [key]: !prev.collapsed[key]}}))
  }, [])

  return {prefs, patch, toggleCollapse}
}
