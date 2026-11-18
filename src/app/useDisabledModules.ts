/**
 * 模块开关的 React 订阅层。
 *
 * 同标签页：writeDisabledModules 派发 MODULE_CHANGED_EVENT。
 * 跨标签页：浏览器原生 storage 事件（只监听 p_disabled）。
 */

import { useEffect, useSyncExternalStore } from 'react'
import type { ModuleId } from '../core/types'
import {
  MODULE_CHANGED_EVENT,
  migrateDisabledModulesStorage,
  readDisabledModules,
} from '../core/modules'

const subscribe = (onChange: () => void): (() => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== 'p_disabled') return
    onChange()
  }
  window.addEventListener(MODULE_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(MODULE_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useDisabledModules(): readonly ModuleId[] {
  const disabled = useSyncExternalStore(subscribe, readDisabledModules, readDisabledModules)

  // 启动时把历史 id（days / time）写回归一结果；幂等，只动 p_disabled
  useEffect(() => {
    migrateDisabledModulesStorage()
  }, [])

  return disabled
}
