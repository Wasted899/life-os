/**
 * 计时器纯逻辑状态机（不依赖 React / localStorage / 网络）。
 *
 * 设计约束：
 * 1. 只信绝对时间戳：倒计时存 endAt，正计时存 accumulatedMs + resumedAt。
 *    任何时刻的剩余/已用时长都由 (state, now) 现算，tick 只负责重绘。
 * 2. 运行态可被 JSON 序列化后原样恢复；restoreRuntime 负责吞掉脏数据。
 * 3. 写入 time_blocks 的草稿只在这里生成，保证「一次会话只落一条」的 id/ref 规则一致。
 */

import type { TimeBlock } from '../../../core/types'

export const TIMER_RUNTIME_VERSION = 1 as const
/** 单次会话时长上限：24 小时，超出部分直接夹回 */
export const MAX_SESSION_MS = 24 * 60 * 60 * 1000
/** 迟到 ≤ 60 秒视为「页面在场」，自动落账；超过则改为待确认 */
export const LATE_END_TOLERANCE_MS = 60 * 1000
/** 结束/暂停超过 24 小时视为过期，运行态直接丢弃 */
export const EXPIRE_MS = 24 * 60 * 60 * 1000
/** 不足 1 秒不产生时间块，避免 0 时长脏数据 */
export const MIN_RECORD_MS = 1000
export const DEFAULT_PLANNED_MS = 25 * 60 * 1000

export type TimerMode = 'countdown' | 'stopwatch'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'ended'

export interface TimerRuntime {
  v: typeof TIMER_RUNTIME_VERSION
  sessionId: string
  /** 当前持有运行态的标签页，防止两个标签页同时落账 */
  ownerTabId: string
  /** userId 或 'local'，防止账号切换后把计时写进别人的时间统计 */
  owner: string
  mode: TimerMode
  status: TimerStatus
  /** 会话开始时间（epoch ms），用于归属日期与时钟回拨判断 */
  startedAt: number
  /** 会话归属日 YYYY-MM-DD（本地时区） */
  dateKey: string
  /** 倒计时目标时长 */
  plannedMs?: number
  /** 倒计时运行中：绝对结束时间戳 */
  endAt?: number
  /** 倒计时暂停时：剩余毫秒 */
  remainingMs?: number
  /** 正计时已累计毫秒（不含当前运行段） */
  accumulatedMs?: number
  /** 正计时当前运行段起点 */
  resumedAt?: number
  /** 结束时的实际已用毫秒（结束态读它，避免再次推导） */
  finalElapsedMs?: number
  /** 结束时间戳（倒计时自然结束取 endAt，提前停止取点击时刻） */
  endedAt?: number
  title: string
  category: string
  /** 已落库的时间块 id（单条或跨零点第一条），用于撤销与防重入 */
  writtenBlockId?: string
  updatedAt: number
}

export interface CreateSessionInput {
  sessionId: string
  mode: TimerMode
  owner: string
  ownerTabId: string
  now: number
  plannedMs?: number
  title?: string
  category?: string
}

export interface RestoreResult {
  runtime: TimerRuntime | null
  /** 运行中倒计时已结束，且迟到超过容忍窗口 → 页面需要弹确认 */
  lateEnded: boolean
  /** 超过 24 小时，运行态已丢弃 */
  expired: boolean
  /** owner 与当前身份不一致，运行态已丢弃 */
  ownerMismatch: boolean
  /** 正计时超过 24 小时，已夹回并暂停 */
  capped: boolean
}

export interface SplitSegment {
  /** YYYY-MM-DD */
  date: string
  /** 十进制小时，0-24 */
  start: number
  /** 十进制小时，0-24，绝不大于 24 */
  end: number
  /** 本段时长（小时） */
  hours: number
  /** 1 基序号 */
  index: number
}

export type TimeBlockDraft = Omit<TimeBlock, 'id'> & { id: string }

const pad2 = (value: number): string => String(value).padStart(2, '0')
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
const round4 = (value: number): number => Math.round(value * 10000) / 10000

const isValidNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isMode = (value: unknown): value is TimerMode => value === 'countdown' || value === 'stopwatch'
const isStatus = (value: unknown): value is TimerStatus =>
  value === 'idle' || value === 'running' || value === 'paused' || value === 'ended'

/** 本地时区日期键 */
export function localDateKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 某毫秒所处的本地零点 */
export function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** 下一个本地零点（按日历日推进，避免简单 +24h 在夏令时下错位） */
function nextLocalMidnight(dayStartMs: number): number {
  const date = new Date(dayStartMs)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
}

function normalizePlannedMs(value: unknown): number {
  if (!isValidNumber(value) || value <= 0) return DEFAULT_PLANNED_MS
  return clamp(Math.round(value), MIN_RECORD_MS, MAX_SESSION_MS)
}

/** 时间块主键：单段 tb_<sessionId>；跨零点 tb_<sessionId>#1 / #2 */
export function sessionBlockId(sessionId: string, part?: number): string {
  return part ? `tb_${sessionId}#${part}` : `tb_${sessionId}`
}

/** 参考 id：单段 = sessionId；跨零点 = sessionId#1 / sessionId#2 */
export function sessionRefId(sessionId: string, part?: number): string {
  return part ? `${sessionId}#${part}` : sessionId
}

export function createSession(input: CreateSessionInput): TimerRuntime {
  const plannedMs = input.mode === 'countdown' ? normalizePlannedMs(input.plannedMs) : undefined
  return {
    v: TIMER_RUNTIME_VERSION,
    sessionId: input.sessionId,
    ownerTabId: input.ownerTabId,
    owner: input.owner,
    mode: input.mode,
    status: 'idle',
    startedAt: input.now,
    dateKey: localDateKey(input.now),
    ...(plannedMs !== undefined ? { plannedMs, remainingMs: plannedMs } : {}),
    title: input.title ?? '',
    category: input.category ?? '',
    updatedAt: input.now,
  }
}

/** 开始 / 继续。已结束的会话必须先 reset，避免复用 sessionId 重复落账 */
export function start(state: TimerRuntime, now: number): TimerRuntime {
  if (state.status === 'running' || state.status === 'ended') return state

  const fromIdle = state.status === 'idle'
  if (state.mode === 'countdown') {
    const plannedMs = normalizePlannedMs(state.plannedMs)
    const remaining = fromIdle ? plannedMs : clamp(state.remainingMs ?? plannedMs, 0, plannedMs)
    return {
      ...state,
      status: 'running',
      startedAt: fromIdle ? now : state.startedAt,
      dateKey: fromIdle ? localDateKey(now) : state.dateKey,
      plannedMs,
      endAt: now + remaining,
      remainingMs: undefined,
      updatedAt: now,
    }
  }

  return {
    ...state,
    status: 'running',
    startedAt: fromIdle ? now : state.startedAt,
    dateKey: fromIdle ? localDateKey(now) : state.dateKey,
    accumulatedMs: fromIdle ? 0 : clamp(state.accumulatedMs ?? 0, 0, MAX_SESSION_MS),
    resumedAt: now,
    updatedAt: now,
  }
}

export function pause(state: TimerRuntime, now: number): TimerRuntime {
  if (state.status !== 'running') return state

  if (state.mode === 'countdown') {
    const remaining = remainingMs(state, now)
    return {
      ...state,
      status: 'paused',
      remainingMs: remaining,
      endAt: undefined,
      updatedAt: now,
    }
  }

  return {
    ...state,
    status: 'paused',
    accumulatedMs: clamp(elapsedMs(state, now), 0, MAX_SESSION_MS),
    resumedAt: undefined,
    updatedAt: now,
  }
}

export const resume = (state: TimerRuntime, now: number): TimerRuntime =>
  state.status === 'paused' ? start(state, now) : state

/** 停止并固化最终时长。自然结束与提前停止共用 */
export function stop(state: TimerRuntime, now: number): TimerRuntime {
  if (state.status === 'ended') return state

  const worked = clamp(elapsedMs(state, now), 0, MAX_SESSION_MS)
  const endedAt = state.mode === 'countdown' && isValidNumber(state.endAt) ? Math.min(now, state.endAt) : now

  if (state.mode === 'countdown') {
    const plannedMs = normalizePlannedMs(state.plannedMs)
    return {
      ...state,
      status: 'ended',
      plannedMs,
      remainingMs: Math.max(0, plannedMs - worked),
      endAt: state.endAt,
      finalElapsedMs: worked,
      endedAt,
      updatedAt: now,
    }
  }

  return {
    ...state,
    status: 'ended',
    accumulatedMs: worked,
    resumedAt: undefined,
    finalElapsedMs: worked,
    endedAt,
    updatedAt: now,
  }
}

/** 重置为空闲态；必须换新 sessionId，否则撤销后会复用旧幂等键 */
export function reset(state: TimerRuntime, now: number, sessionId: string): TimerRuntime {
  return createSession({
    sessionId,
    mode: state.mode,
    owner: state.owner,
    ownerTabId: state.ownerTabId,
    now,
    plannedMs: state.plannedMs,
    title: state.title,
    category: state.category,
  })
}

/** 剩余毫秒。倒计时之外恒为 0 */
export function remainingMs(state: TimerRuntime, now: number): number {
  if (state.mode !== 'countdown') return 0
  if (state.status === 'idle') return normalizePlannedMs(state.plannedMs)
  if (state.status === 'paused') return clamp(state.remainingMs ?? 0, 0, MAX_SESSION_MS)
  if (state.status === 'ended') return 0

  const planned = normalizePlannedMs(state.plannedMs)
  if (!isValidNumber(state.endAt)) return planned
  // 时钟回拨时 endAt-now 会大于目标时长，夹回 planned；时钟前跳则自然归零
  return clamp(state.endAt - now, 0, planned)
}

/** 已用毫秒。结束态读 finalElapsedMs，保证停止后数值不再漂移 */
export function elapsedMs(state: TimerRuntime, now: number): number {
  if (state.status === 'ended') {
    if (isValidNumber(state.finalElapsedMs)) return clamp(state.finalElapsedMs, 0, MAX_SESSION_MS)
    if (state.mode === 'countdown') {
      return clamp(normalizePlannedMs(state.plannedMs) - remainingMs(state, now), 0, MAX_SESSION_MS)
    }
    return clamp(state.accumulatedMs ?? 0, 0, MAX_SESSION_MS)
  }

  if (state.mode === 'countdown') {
    return clamp(normalizePlannedMs(state.plannedMs) - remainingMs(state, now), 0, MAX_SESSION_MS)
  }

  if (state.status === 'idle') return 0
  const accumulated = clamp(state.accumulatedMs ?? 0, 0, MAX_SESSION_MS)
  if (state.status === 'paused' || !isValidNumber(state.resumedAt)) return accumulated
  return clamp(accumulated + Math.max(0, now - state.resumedAt), 0, MAX_SESSION_MS)
}

/** 把运行态按「已结束」整理；用于页面刷新/切回标签页时判定 */
export function restoreRuntime(
  raw: unknown,
  now: number,
  expectedOwner?: string,
): RestoreResult {
  const empty: RestoreResult = {
    runtime: null,
    lateEnded: false,
    expired: false,
    ownerMismatch: false,
    capped: false,
  }

  if (!raw || typeof raw !== 'object') return empty
  const item = raw as Record<string, unknown>
  if (item.v !== TIMER_RUNTIME_VERSION) return empty

  const sessionId = typeof item.sessionId === 'string' ? item.sessionId : ''
  if (!sessionId) return empty
  if (!isMode(item.mode) || !isStatus(item.status)) return empty

  const owner = typeof item.owner === 'string' ? item.owner : 'local'
  if (expectedOwner && owner !== expectedOwner) {
    return { ...empty, ownerMismatch: true }
  }

  const startedAt = isValidNumber(item.startedAt) ? item.startedAt : now
  const runtime: TimerRuntime = {
    v: TIMER_RUNTIME_VERSION,
    sessionId,
    ownerTabId: typeof item.ownerTabId === 'string' ? item.ownerTabId : '',
    owner,
    mode: item.mode,
    status: item.status,
    startedAt,
    dateKey: typeof item.dateKey === 'string' && item.dateKey ? item.dateKey : localDateKey(startedAt),
    plannedMs: item.mode === 'countdown' ? normalizePlannedMs(item.plannedMs) : undefined,
    endAt: isValidNumber(item.endAt) ? item.endAt : undefined,
    remainingMs: isValidNumber(item.remainingMs) ? item.remainingMs : undefined,
    accumulatedMs: isValidNumber(item.accumulatedMs) ? item.accumulatedMs : undefined,
    resumedAt: isValidNumber(item.resumedAt) ? item.resumedAt : undefined,
    finalElapsedMs: isValidNumber(item.finalElapsedMs) ? item.finalElapsedMs : undefined,
    endedAt: isValidNumber(item.endedAt) ? item.endedAt : undefined,
    title: typeof item.title === 'string' ? item.title : '',
    category: typeof item.category === 'string' ? item.category : '',
    writtenBlockId: typeof item.writtenBlockId === 'string' ? item.writtenBlockId : undefined,
    updatedAt: isValidNumber(item.updatedAt) ? item.updatedAt : now,
  }

  // 已结束的会话过期即丢弃
  if (runtime.status === 'ended' && isValidNumber(runtime.endedAt) && now - runtime.endedAt > EXPIRE_MS) {
    return { ...empty, expired: true }
  }
  // 暂停中的倒计时长期未处理，同样视为过期
  if (runtime.status === 'paused' && runtime.mode === 'countdown' && now - runtime.updatedAt > EXPIRE_MS) {
    return { ...empty, expired: true }
  }

  if (runtime.status !== 'running') return { ...empty, runtime }

  if (runtime.mode === 'countdown') {
    const planned = normalizePlannedMs(runtime.plannedMs)
    if (!isValidNumber(runtime.endAt)) {
      // 缺少结束时间戳，退回暂停态，不猜剩余
      return {
        ...empty,
        runtime: { ...runtime, status: 'paused', plannedMs: planned, remainingMs: planned, endAt: undefined },
      }
    }

    // 时钟回拨：结束时间比目标还远，夹回
    if (runtime.endAt - now > planned) {
      return { ...empty, runtime: { ...runtime, endAt: now + planned, startedAt: Math.min(runtime.startedAt, now) } }
    }

    if (now >= runtime.endAt) {
      const lateness = now - runtime.endAt
      if (lateness > EXPIRE_MS) return { ...empty, expired: true }

      const ended: TimerRuntime = {
        ...runtime,
        status: 'ended',
        plannedMs: planned,
        remainingMs: 0,
        finalElapsedMs: planned,
        endedAt: runtime.endAt,
        updatedAt: now,
      }
      return {
        ...empty,
        runtime: ended,
        lateEnded: lateness > LATE_END_TOLERANCE_MS && !ended.writtenBlockId,
      }
    }

    // 运行中但开始时间在未来（系统时间回拨）
    const fixed: TimerRuntime = runtime.startedAt > now
      ? { ...runtime, startedAt: now, dateKey: localDateKey(now) }
      : runtime
    return { ...empty, runtime: fixed }
  }

  // 正计时：没有"已结束"概念，只处理时钟回拨与 24 小时夹回
  const resumedAt = runtime.resumedAt
  if (!isValidNumber(resumedAt) || resumedAt > now) {
    return { ...empty, runtime: { ...runtime, resumedAt: now, startedAt: Math.min(runtime.startedAt, now) } }
  }

  const elapsed = (runtime.accumulatedMs ?? 0) + (now - resumedAt)
  if (elapsed > MAX_SESSION_MS) {
    return {
      ...empty,
      capped: true,
      runtime: {
        ...runtime,
        status: 'paused',
        accumulatedMs: MAX_SESSION_MS,
        resumedAt: undefined,
        updatedAt: now,
      },
    }
  }

  return { ...empty, runtime }
}

/**
 * 把一个时间区间按本地零点拆段。
 * start 取 0-24 的十进制小时，end 最多到 24，绝不产生 end>24 的脏数据。
 */
export function splitAcrossMidnight(startMs: number, durationMs: number): SplitSegment[] {
  if (!isValidNumber(startMs) || !isValidNumber(durationMs) || durationMs <= 0) return []

  const total = Math.min(durationMs, MAX_SESSION_MS)
  const endMs = startMs + total
  const segments: SplitSegment[] = []
  let cursor = startMs

  while (cursor < endMs) {
    const dayStart = startOfLocalDay(cursor)
    const dayEnd = nextLocalMidnight(dayStart)
    const segmentEnd = Math.min(endMs, dayEnd)
    const start = round4((cursor - dayStart) / 3600000)
    const end = round4((segmentEnd - dayStart) / 3600000)
    if (end > start) {
      segments.push({
        date: localDateKey(dayStart),
        start,
        end: Math.min(24, end),
        hours: round4((segmentEnd - cursor) / 3600000),
        index: segments.length + 1,
      })
    }
    cursor = segmentEnd
  }

  return segments
}

/**
 * 生成待写入的 time_blocks 草稿。
 * - 时间轴按「结束时刻 - 实际已用」反推，暂停会被压缩掉，保证 end-start === duration。
 * - 跨零点拆成两条，ref_id 加 #1/#2，主键同步加后缀。
 * - 不足 1 秒返回空数组。
 */
export function toTimeBlockDraft(
  state: TimerRuntime,
  now: number,
  options?: { elapsedMs?: number; endMs?: number },
): TimeBlockDraft[] {
  const worked = clamp(options?.elapsedMs ?? elapsedMs(state, now), 0, MAX_SESSION_MS)
  if (worked < MIN_RECORD_MS) return []

  const endMs = options?.endMs ?? state.endedAt ?? state.endAt ?? now
  const startMs = endMs - worked
  const segments = splitAcrossMidnight(startMs, worked)
  if (segments.length === 0) return []

  const multi = segments.length > 1
  const title = state.title.trim() || state.category.trim() || '计时'
  const category = state.category.trim() || '其他'

  return segments.map(segment => ({
    id: sessionBlockId(state.sessionId, multi ? segment.index : undefined),
    date: segment.date,
    start: segment.start,
    end: segment.end,
    title,
    category,
    source: 'timer',
    ref_type: 'timer',
    ref_id: sessionRefId(state.sessionId, multi ? segment.index : undefined),
    duration: segment.hours,
  }))
}

/** 大字号时钟：不足 1 小时显示 MM:SS，超过 1 小时显示 H:MM:SS */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`
}

/** 十进制小时 → HH:MM，用于今日记录列表 */
export function formatHours(hours: number): string {
  const safe = clamp(Number.isFinite(hours) ? hours : 0, 0, 24)
  const totalMinutes = Math.round(safe * 60)
  const hh = Math.min(24, Math.floor(totalMinutes / 60))
  const mm = totalMinutes % 60
  return `${pad2(hh)}:${pad2(mm)}`
}

/** 生成指定分钟的预设（页面用） */
export const presetMinutes = [5, 15, 25, 45, 60] as const
