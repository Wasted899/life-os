/**
 * 云同步判定层（M1-6）
 *
 * 设计原则：
 * 1. 纯函数：不依赖 React、不直接访问 supabase / localStorage，便于推理与后续单测。
 * 2. 云端的"空"必须由调用方在"读取成功"的前提下传入；读取失败禁止进入本文件的任何判定。
 * 3. 合并策略（已批准）：同 id 以云端为准；仅本地存在的条目保留；仅云端存在的条目加入。
 *    合并只修改本地，不自动上传。
 */
import type {DomainData, DomainKey} from './types'
import {sanitizeAll} from '../lib/sanitize'

/** 13 个云同步域与表名（顺序固定，避免各处不一致） */
export const CLOUD_DOMAINS: readonly {key: DomainKey; table: string}[] = [
  {key: 'todos', table: 'todos'},
  {key: 'lists', table: 'todo_lists'},
  {key: 'categories', table: 'categories'},
  {key: 'goals', table: 'goals'},
  {key: 'habits', table: 'habits'},
  {key: 'days', table: 'important_days'},
  {key: 'timeBlocks', table: 'time_blocks'},
  {key: 'pomodoros', table: 'pomodoros'},
  {key: 'transactions', table: 'transactions'},
  {key: 'memos', table: 'memos'},
  {key: 'financeCategories', table: 'finance_categories'},
  {key: 'accounts', table: 'accounts'},
  {key: 'recurrings', table: 'recurrings'},
]

export const CLOUD_TABLES: readonly string[] = CLOUD_DOMAINS.map(d => d.table)

/** 各域默认种子 id：判"本地是否为空"时必须排除，否则空库永远被判成有数据 */
export const SEED_IDS: Partial<Record<DomainKey, readonly string[]>> = {
  lists: ['inbox'],
  categories: ['c1', 'c2', 'c3', 'c4', 'c5'],
  financeCategories: ['fc1', 'fc2', 'fc3', 'fc4', 'fc5', 'fc6', 'fi1', 'fi2', 'fi3', 'fi4'],
}

/** 弹窗文案用的中文名 */
export const DOMAIN_LABELS: Record<string, string> = {
  todos: '待办',
  lists: '清单',
  categories: '分类',
  goals: '目标',
  habits: '习惯',
  days: '重要日子',
  timeBlocks: '时间块',
  pomodoros: '番茄钟',
  transactions: '记账',
  memos: '备忘录',
  financeCategories: '记账分类',
  accounts: '账户',
  recurrings: '周期账单',
}

export type CloudPayload = Partial<Record<DomainKey, any[]>>
export type DomainCounts = Record<string, number>

/** 单域"有效条数"：排除默认种子 */
export function countMeaningful(key: DomainKey, rows: any[]): number {
  const list = Array.isArray(rows) ? rows : []
  const seeds = SEED_IDS[key]
  if (!seeds) return list.length
  return list.filter(row => row && !seeds.includes(String(row.id))).length
}

/** 本机是否"没有有效数据"（只剩默认种子也算空） */
export function inspectLocal(data: DomainData): {empty: boolean; counts: DomainCounts} {
  const counts: DomainCounts = {}
  let total = 0
  for (const {key} of CLOUD_DOMAINS) {
    const n = countMeaningful(key, (data as any)[key])
    counts[key] = n
    total += n
  }
  return {empty: total === 0, counts}
}

/**
 * 云端是否有"有效数据"：按域排除默认种子。
 * 云端只剩种子（例如另一台设备刚初始化）时不应视为"云端有数据"，
 * 否则本地有内容时会被误判为冲突。
 */
export function hasMeaningfulCloudRows(cloud: CloudPayload): boolean {
  return CLOUD_DOMAINS.some(({key}) => countMeaningful(key, cloud[key] || []) > 0)
}

/** 云端 13 表 → DomainData（sanitize 会补齐默认种子与必填字段） */
export function toDomainData(payload: CloudPayload): DomainData {
  const raw: Record<string, any[]> = {}
  for (const {key} of CLOUD_DOMAINS) raw[key] = payload[key] || []
  return sanitizeAll(raw) as DomainData
}

/** 决策输入：ok=false 表示读取失败，此时 cloud 内容不可信 */
export interface CloudDecisionInput {
  ok: boolean
  failed: string[]
  cloud: CloudPayload
  local: DomainData
  /** 上一次已处理过的云端状态（来自 localStorage） */
  meta: {userId: string; cloudSignature: string} | null
  userId: string
}

/**
 * 登录后云端判定的唯一出口。
 * 判定顺序必须与历史行为一致：读取失败 → 云端为空 → 本地为空 → 已处理过 → 仅内容变化 → 冲突。
 */
export type CloudDecision =
  | {kind: 'error'; failed: string[]; counts: DomainCounts; message: string}
  | {kind: 'offer-upload'; counts: DomainCounts}
  | {kind: 'idle'; counts: DomainCounts}
  | {
      kind: 'pull'
      counts: DomainCounts
      data: DomainData
      signature: string
      source: 'empty-local' | 'identical-ids'
    }
  | {
      kind: 'conflict'
      counts: DomainCounts
      signature: string
      merge: {added: number; updated: number; keptLocalOnly: number; cloudTotal: number}
    }

export function decideCloudAction(input: CloudDecisionInput): CloudDecision {
  const {ok, failed, cloud, local, meta, userId} = input
  const localInfo = inspectLocal(local)

  // 1) 读取失败：保留本地，绝不当作"云端为空"
  if (!ok) {
    return {
      kind: 'error',
      failed: [...failed],
      counts: localInfo.counts,
      message: '云端读取失败，已保留本机数据',
    }
  }

  // 2) 云端没有有效数据（只剩种子也算空）：本地也空 → 静默；本地有 → 询问是否上传
  if (!hasMeaningfulCloudRows(cloud)) {
    return localInfo.empty
      ? {kind: 'idle', counts: localInfo.counts}
      : {kind: 'offer-upload', counts: localInfo.counts}
  }

  const signature = buildCloudSignature(cloud)

  // 3) 云端有、本地空 → 静默拉取
  if (localInfo.empty) {
    return {
      kind: 'pull',
      counts: localInfo.counts,
      data: toDomainData(cloud),
      signature,
      source: 'empty-local',
    }
  }

  // 4) 同一份云端状态只处理一次
  if (meta && meta.userId === userId && meta.cloudSignature === signature) {
    return {kind: 'idle', counts: localInfo.counts}
  }

  const merged = mergeCloudIntoLocal(local, cloud)
  const cloudTotal = CLOUD_DOMAINS.reduce((sum, {key}) => sum + (cloud[key]?.length || 0), 0)

  // 两边 id 集合完全一致 = 已同步（只可能是内容更新），静默以云端为准。
  // 必须应用 merged 而不是裸 payload，否则云端某域为空时会冲掉本地分类/清单。
  if (merged.added === 0 && merged.keptLocalOnly === 0) {
    return {
      kind: 'pull',
      counts: localInfo.counts,
      data: sanitizeAll(merged.data) as DomainData,
      signature,
      source: 'identical-ids',
    }
  }

  return {
    kind: 'conflict',
    counts: localInfo.counts,
    signature,
    merge: {
      added: merged.added,
      updated: merged.updated,
      keptLocalOnly: merged.keptLocalOnly,
      cloudTotal,
    },
  }
}

export interface MergeResult {
  data: DomainData
  /** 仅云端有 → 新增到本地 */
  added: number
  /** 两边同 id → 用云端覆盖 */
  updated: number
  /** 仅本地有 → 保留 */
  keptLocalOnly: number
}

/** 合并：云端赢；只改本地，不上传 */
export function mergeCloudIntoLocal(local: DomainData, cloud: CloudPayload): MergeResult {
  const data = {...local} as DomainData
  let added = 0
  let updated = 0
  let keptLocalOnly = 0

  for (const {key} of CLOUD_DOMAINS) {
    const cloudRows = Array.isArray(cloud[key]) ? (cloud[key] as any[]) : []
    // 云端该域为空时，本地原样保留（避免"云端没传种子数据"把本地种子冲掉）
    if (cloudRows.length === 0) continue

    const localRows = Array.isArray((local as any)[key]) ? ((local as any)[key] as any[]) : []
    const cloudById = new Map<string, any>()
    for (const row of cloudRows) {
      if (row && row.id != null) cloudById.set(String(row.id), row)
    }

    const merged: any[] = localRows.map(row => {
      const hit = row && row.id != null ? cloudById.get(String(row.id)) : undefined
      if (hit) {
        updated += 1
        return {...row, ...hit}
      }
      keptLocalOnly += 1
      return row
    })

    const localIds = new Set(localRows.filter(r => r && r.id != null).map(r => String(r.id)))
    for (const [id, row] of cloudById) {
      if (!localIds.has(id)) {
        merged.push(row)
        added += 1
      }
    }

    ;(data as any)[key] = merged
  }

  return {data, added, updated, keptLocalOnly}
}

/** djb2 字符串哈希，用于压缩签名长度 */
const hash = (input: string): string => {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * 云端指纹：每域"条数 + 排序后的 id 哈希"。
 * 用途：同一次云端状态不重复弹窗；云端被别的设备改动后签名变化，会重新询问。
 */
export function buildCloudSignature(cloud: CloudPayload): string {
  return CLOUD_DOMAINS.map(({key}) => {
    const rows = Array.isArray(cloud[key]) ? (cloud[key] as any[]) : []
    const ids = rows.map(row => String(row?.id ?? '')).sort()
    return `${key}:${rows.length}:${hash(ids.join(','))}`
  }).join('|')
}

export type CloudPhase = 'idle' | 'checking' | 'offer-upload' | 'conflict' | 'error'

export interface CloudUiState {
  phase: CloudPhase
  /** 读取失败的表名（仅 phase='error' 时有意义） */
  failedTables: string[]
  /** 本机各域有效条数（已排除默认种子） */
  counts: DomainCounts
  /** 合并预览（仅 phase='conflict'） */
  merge?: {added: number; updated: number; keptLocalOnly: number; cloudTotal: number}
  message?: string
}

export const IDLE_CLOUD_STATE: CloudUiState = {phase: 'idle', failedTables: [], counts: {}}
