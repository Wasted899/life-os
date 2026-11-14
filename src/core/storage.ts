/**
 * localStorage 适配层（批次 2）
 *
 * 规则：
 * 1. 新写入统一走 `planner:<key>` 命名空间，值为 { v, data } 信封。
 * 2. 读取顺序：新 key 信封 → 新 key 裸值（手工写入容错）→ 旧 key（保持可读）。
 * 3. 旧 key 永不删除、永不迁移；只读兜底。
 * 4. 所有异常（无 localStorage / JSON 损坏 / 配额满）一律静默降级，不抛错。
 * 5. 少数仍被页面直接读取的旧 key（复盘 / 昵称 / 头像 / 功能开关）必须用
 *    readLegacy / writeLegacy 走原始 key，否则页面读不到（见 DataContext 的 extras）。
 */

export const STORAGE_PREFIX = 'planner'
export const SCHEMA_VERSION = 1

/** 备份 key：独立于业务命名空间，避免被迁移覆盖 */
export const BACKUP_KEYS = {
  /** 首次把本地快照交给 migrate 之前的原始数据，只写一次 */
  local: 'planner:backup:raw-local-before-migrate',
  /** 最近一次导入的原始 JSON，每次导入覆盖，只保留一份 */
  import: 'planner:backup:raw-last-import',
  /** 上传并清空云端之前的云端快照，单份覆盖；用于"本机覆盖云端"的回退 */
  cloudBeforeOverwrite: 'planner:backup:cloud-before-overwrite',
} as const

/** 云同步元数据：记录"上一次已处理过的云端状态"，避免同一份云端数据反复弹窗 */
export const CLOUD_SYNC_KEY = 'planner:cloud:last-sync'

/** 登录前的本地工作区快照：登出时恢复到这份数据，绝不清空（M1-5） */
export const LOCAL_WORKSPACE_KEY = 'planner:auth:local-workspace'

/** 当前 p_* 缓存属于谁：'local' 或 userId（M1-5 防账号串号） */
export const ACTIVE_OWNER_KEY = 'planner:auth:owner'

export interface CloudSyncMeta {
  userId: string
  cloudSignature: string
  at: string
}

export function readCloudSyncMeta(): CloudSyncMeta | null {
  const value = readBackup<CloudSyncMeta>(CLOUD_SYNC_KEY)
  if (!value || typeof value !== 'object') return null
  if (typeof value.userId !== 'string' || typeof value.cloudSignature !== 'string') return null
  return value
}

export function writeCloudSyncMeta(meta: CloudSyncMeta): boolean {
  return saveBackup(CLOUD_SYNC_KEY, meta)
}

/**
 * 清除云同步元数据（M1-5）。
 * 登出时必须调用：否则同一账号重新登录时签名命中会静默跳过云端判定，
 * 导致本地工作区数据不会与云端对齐。
 */
export function clearCloudSyncMeta(): boolean {
  if (!canUseStorage()) return false
  try {
    localStorage.removeItem(CLOUD_SYNC_KEY)
    return true
  } catch {
    return false
  }
}

export interface StorageEnvelope<T> {
  v: number
  data: T
}

export const nsKey = (key: string): string => `${STORAGE_PREFIX}:${key}`

const canUseStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export const isEnvelope = (value: unknown): value is StorageEnvelope<unknown> =>
  !!value && typeof value === 'object' && 'v' in value && 'data' in value

const parse = <T>(raw: string | null): T | undefined => {
  if (raw == null) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/**
 * 读取数据集。
 * @param key 逻辑 key（沿用旧 key 名，如 'p_todos'），内部自动加命名空间
 * @param def 全部读取失败时的兜底值
 */
export function load<T>(key: string, def: T): T {
  if (!canUseStorage()) return def
  try {
    const next = parse<unknown>(localStorage.getItem(nsKey(key)))
    if (next !== undefined) {
      return (isEnvelope(next) ? next.data : next) as T
    }
    const legacy = parse<T>(localStorage.getItem(key))
    return legacy !== undefined ? legacy : def
  } catch {
    return def
  }
}

/**
 * 写入数据集（只写新命名空间，不触碰旧 key）。
 * @returns 是否写入成功（调用方可忽略）
 */
export function save(key: string, value: unknown): boolean {
  if (!canUseStorage()) return false
  try {
    const envelope: StorageEnvelope<unknown> = { v: SCHEMA_VERSION, data: value }
    localStorage.setItem(nsKey(key), JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

/** 读取原始值（不套默认值）：新命名空间信封 → 新裸值 → 旧 key。用于备份原始快照 */
export function readRaw(key: string): unknown {
  if (!canUseStorage()) return undefined
  try {
    const next = parse<unknown>(localStorage.getItem(nsKey(key)))
    if (next !== undefined) return isEnvelope(next) ? next.data : next
    return parse<unknown>(localStorage.getItem(key))
  } catch {
    return undefined
  }
}

/** 只读旧 key（页面仍直接使用 localStorage 的场景） */
export function readLegacy<T>(key: string, def: T): T {
  if (!canUseStorage()) return def
  try {
    const value = parse<T>(localStorage.getItem(key))
    return value !== undefined ? value : def
  } catch {
    return def
  }
}

/** 读旧 key 的纯文本值（p_nick / p_avatar 在页面里是裸字符串，不是 JSON） */
export function readLegacyText(key: string, def = ''): string {
  if (!canUseStorage()) return def
  try {
    return localStorage.getItem(key) ?? def
  } catch {
    return def
  }
}

/** 写旧 key 的纯文本值（仅用于 p_nick / p_avatar） */
export function writeLegacyText(key: string, value: string): boolean {
  if (!canUseStorage()) return false
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * 写旧 key（仅用于页面仍直接读取 localStorage 的数据：复盘 / 昵称 / 头像 / 功能开关）。
 * 新写入的业务数据不要用这个函数。
 */
export function writeLegacy(key: string, value: unknown): boolean {
  if (!canUseStorage()) return false
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** 备份：已存在则跳过，保证原始快照只保留一份、不会被二次运行覆盖 */
export function backupOnce(key: string, value: unknown): boolean {
  if (!canUseStorage()) return false
  try {
    if (localStorage.getItem(key) != null) return false
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** 备份：直接覆盖（用于导入前的原始 JSON，只保留最近一份） */
export function saveBackup(key: string, value: unknown): boolean {
  if (!canUseStorage()) return false
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function readBackup<T = unknown>(key: string): T | undefined {
  if (!canUseStorage()) return undefined
  try {
    return parse<T>(localStorage.getItem(key))
  } catch {
    return undefined
  }
}

/** 生成轻量唯一 id（沿用旧实现，保持数据形态不变） */
export const uid = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36)
