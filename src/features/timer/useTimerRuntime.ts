/**
 * 计时器运行态 Hook。
 *
 * 职责边界：
 * - 运行态持久化到 planner:timer:runtime（不进 DomainData / 13 域 / 导出）
 * - tick 只触发重绘；剩余/已用时间全部由时间戳现算
 * - 结束判定只在「结束态」发生一次，落库走 DataContext.logTimeBlock（自带幂等）
 * - 多标签页：单活动会话，后开者接管；非持有页不落账
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { load, save, uid } from '../../core/storage'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import {
  LATE_END_TOLERANCE_MS,
  createSession,
  elapsedMs,
  pause,
  reset,
  restoreRuntime,
  resume,
  start,
  stop,
  toTimeBlockDraft,
} from './model/timerMachine'
import type { TimerMode, TimerRuntime } from './model/timerMachine'

export const TIMER_RUNTIME_KEY = 'timer:runtime'
const STORAGE_KEY = `planner:${TIMER_RUNTIME_KEY}`
const TAKEOVER_STALE_MS = 30 * 1000
const HEARTBEAT_MS = 10 * 1000

export interface TimerPending {
  runtime: TimerRuntime
  /** 弹窗打开时的已用毫秒（预填用） */
  elapsedMs: number
  /** 归入哪个时刻结束：自然结束 = endAt，手动停止 = 点击停止的时刻 */
  endMs: number
  reason: 'late' | 'stop'
}

export interface TimerLastLog {
  sessionId: string
  ids: string[]
  minutes: number
}

export interface StartTimerInput {
  mode: TimerMode
  plannedMs?: number
  title?: string
  category?: string
}

export interface TimerRuntimeApi {
  runtime: TimerRuntime | null
  now: number
  pending: TimerPending | null
  lastLog: TimerLastLog | null
  notice: string
  startNew: (input: StartTimerInput) => void
  pauseTimer: () => void
  resumeTimer: () => void
  requestStop: () => void
  confirmPending: (minutes: number, patch?: { title?: string; category?: string }) => void
  cancelPending: () => void
  abandonPending: () => void
  resetTimer: () => void
  undoLastLog: () => void
  clearNotice: () => void
}

export function useTimerRuntime(): TimerRuntimeApi {
  const { user, loading } = useAuth()
  const { logTimeBlock, deleteTimeBlock } = useData()

  const owner = user?.id ?? 'local'
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const prevOwnerRef = useRef(owner)
  const tabIdRef = useRef(uid())
  const initializedRef = useRef(false)
  const handledSessionRef = useRef('')
  const runtimeRef = useRef<TimerRuntime | null>(null)

  const logRef = useRef(logTimeBlock)
  logRef.current = logTimeBlock
  const deleteRef = useRef(deleteTimeBlock)
  deleteRef.current = deleteTimeBlock

  const [runtime, setRuntime] = useState<TimerRuntime | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [pending, setPending] = useState<TimerPending | null>(null)
  const [lastLog, setLastLog] = useState<TimerLastLog | null>(null)
  const [notice, setNotice] = useState('')

  runtimeRef.current = runtime

  /** 把已结束的会话写入 time_blocks；返回写入结果（不足 1 秒则为 null） */
  const logEnded = useCallback((state: TimerRuntime, options?: { elapsedMs?: number; endMs?: number }) => {
    if (state.writtenBlockId) return null
    const stamp = Date.now()
    const drafts = toTimeBlockDraft(state, stamp, options)
    if (drafts.length === 0) return null

    const ids = drafts.map(draft => logRef.current(draft).id)
    const worked = options?.elapsedMs ?? elapsedMs(state, stamp)
    const result: TimerLastLog = {
      sessionId: state.sessionId,
      ids,
      minutes: Math.round(worked / 60000),
    }
    setLastLog(result)
    return result
  }, [])

  const clearRuntimeStorage = useCallback(() => {
    save(TIMER_RUNTIME_KEY, null)
  }, [])

  // 1) 首次恢复：账号解析完成后再读，避免把 local 运行态误判为串号
  useEffect(() => {
    if (initializedRef.current || loading) return
    initializedRef.current = true

    const raw = load<TimerRuntime | null>(TIMER_RUNTIME_KEY, null)
    const stamp = Date.now()
    const result = restoreRuntime(raw, stamp, owner)

    if (result.ownerMismatch) {
      clearRuntimeStorage()
      setNotice('上次计时属于其他账号，已清除运行态')
      return
    }
    if (result.expired) {
      clearRuntimeStorage()
      setNotice('上次计时已超过 24 小时，未记录')
      return
    }

    let restored = result.runtime
    if (!restored) return

    const staleOwner = restored.status === 'running'
      && !!restored.ownerTabId
      && restored.ownerTabId !== tabIdRef.current
      && stamp - restored.updatedAt < TAKEOVER_STALE_MS

    if (staleOwner) {
      setNotice('另一标签页正在计时，本页只读；点击开始可接管')
    } else if (restored.status === 'running') {
      restored = { ...restored, ownerTabId: tabIdRef.current, updatedAt: stamp }
    }

    setRuntime(restored)

    if (restored.status !== 'ended' || restored.writtenBlockId) return
    if (result.lateEnded) {
      handledSessionRef.current = restored.sessionId
      setPending({
        runtime: restored,
        elapsedMs: elapsedMs(restored, stamp),
        endMs: restored.endedAt ?? stamp,
        reason: 'late',
      })
      return
    }

    // 迟到 ≤60 秒：页面在场，自动落账
    handledSessionRef.current = restored.sessionId
    const logged = logEnded(restored)
    setRuntime({ ...restored, writtenBlockId: logged?.ids[0] })
    if (!logged) setNotice('本次计时不足 1 秒，未记录')
  }, [loading, owner, clearRuntimeStorage, logEnded])

  // 2) 运行态变化即持久化（不含剩余秒数）
  useEffect(() => {
    if (!initializedRef.current) return
    save(TIMER_RUNTIME_KEY, runtime)
  }, [runtime])

  // 3) 账号切换：运行态不跨账号，直接丢弃
  useEffect(() => {
    if (prevOwnerRef.current === owner) return
    prevOwnerRef.current = owner
    if (!initializedRef.current) return
    const current = runtimeRef.current
    if (!current || current.owner === owner) return
    setRuntime(null)
    setPending(null)
    setLastLog(null)
    clearRuntimeStorage()
    setNotice('账号已切换，上一账号的计时运行态已清除')
  }, [owner, clearRuntimeStorage])

  // 4) tick：只更新"现在"，所有数值由时间戳推导
  useEffect(() => {
    if (!runtime || runtime.status !== 'running') return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [runtime?.status, runtime?.sessionId])

  // 5) 唤醒：立即重算并进入结束判定
  useEffect(() => {
    const wake = () => setNow(Date.now())
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('pageshow', wake)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      window.removeEventListener('pageshow', wake)
    }
  }, [])

  // 6) 心跳：让其他标签页能判断"持有页是否还活着"
  useEffect(() => {
    if (!runtime || runtime.status !== 'running') return
    const timer = window.setInterval(() => {
      const current = runtimeRef.current
      if (!current || current.status !== 'running' || current.ownerTabId !== tabIdRef.current) return
      const next = { ...current, updatedAt: Date.now() }
      runtimeRef.current = next
      save(TIMER_RUNTIME_KEY, next)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [runtime?.status, runtime?.sessionId])

  // 7) 多标签页：storage 事件只在本页被动跟随
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const next = load<TimerRuntime | null>(TIMER_RUNTIME_KEY, null)
      setNow(Date.now())
      setPending(null)
      setRuntime(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 8) 结束判定：倒计时到点 / 接管过期持有页
  useEffect(() => {
    if (!runtime || runtime.status !== 'running' || runtime.mode !== 'countdown') return
    if (!runtime.endAt || now < runtime.endAt) return
    if (handledSessionRef.current === runtime.sessionId) return

    const stamp = Date.now()
    const ownedByMe = runtime.ownerTabId === tabIdRef.current
    const ownerAlive = stamp - runtime.updatedAt < TAKEOVER_STALE_MS
    if (!ownedByMe && runtime.ownerTabId && ownerAlive) return

    handledSessionRef.current = runtime.sessionId
    const ended = { ...stop(runtime, stamp), ownerTabId: tabIdRef.current, updatedAt: stamp }
    const late = !!ended.endedAt && stamp - ended.endedAt > LATE_END_TOLERANCE_MS

    if (late) {
      setRuntime(ended)
      setPending({
        runtime: ended,
        elapsedMs: elapsedMs(ended, stamp),
        endMs: ended.endedAt ?? stamp,
        reason: 'late',
      })
      return
    }

    const logged = logEnded(ended)
    setRuntime({ ...ended, writtenBlockId: logged?.ids[0] })
    if (!logged) setNotice('本次计时不足 1 秒，未记录')
  }, [now, runtime, logEnded])

  const startNew = useCallback((input: StartTimerInput) => {
    const current = runtimeRef.current

    if (current && current.status === 'running') {
      const otherTab = !!current.ownerTabId && current.ownerTabId !== tabIdRef.current
      const alive = Date.now() - current.updatedAt < TAKEOVER_STALE_MS
      if (otherTab && alive) {
        const accepted = typeof window === 'undefined' || window.confirm('另一个标签页正在计时，是否接管？')
        if (!accepted) return
      } else if (!otherTab) {
        return
      }
    }

    const stamp = Date.now()
    const session = createSession({
      sessionId: uid(),
      mode: input.mode,
      owner: ownerRef.current,
      ownerTabId: tabIdRef.current,
      now: stamp,
      plannedMs: input.plannedMs,
      title: input.title,
      category: input.category,
    })
    handledSessionRef.current = ''
    setPending(null)
    setLastLog(null)
    setNotice('')
    setRuntime(start(session, stamp))
    setNow(stamp)
  }, [])

  const pauseTimer = useCallback(() => {
    const current = runtimeRef.current
    if (!current || current.status !== 'running') return
    const next = pause(current, Date.now())
    setRuntime(next)
    setNow(Date.now())
  }, [])

  const resumeTimer = useCallback(() => {
    const current = runtimeRef.current
    if (!current || current.status !== 'paused') return
    const stamp = Date.now()
    setRuntime(resume(current, stamp))
    setNow(stamp)
  }, [])

  const requestStop = useCallback(() => {
    const current = runtimeRef.current
    if (!current || (current.status !== 'running' && current.status !== 'paused')) return
    const stamp = Date.now()
    const stopped = current.status === 'running' ? pause(current, stamp) : current
    setRuntime(stopped)
    setNow(stamp)
    setPending({
      runtime: stopped,
      elapsedMs: elapsedMs(stopped, stamp),
      endMs: stamp,
      reason: 'stop',
    })
  }, [])

  const confirmPending = useCallback((minutes: number, patch?: { title?: string; category?: string }) => {
    if (!pending) return
    const worked = Math.max(0, Math.round(minutes * 60000))
    const state: TimerRuntime = {
      ...pending.runtime,
      title: patch?.title ?? pending.runtime.title,
      category: patch?.category ?? pending.runtime.category,
      status: 'ended',
      finalElapsedMs: worked,
      endedAt: pending.endMs,
      updatedAt: Date.now(),
    }
    const logged = logEnded(state, { elapsedMs: worked, endMs: pending.endMs })
    handledSessionRef.current = state.sessionId
    setRuntime({ ...state, writtenBlockId: logged?.ids[0] })
    setPending(null)
    if (!logged) setNotice('时长不足 1 秒，未记录')
  }, [pending, logEnded])

  /** 关闭弹窗：手动停止回到暂停态；迟到结束保持已结束未记录 */
  const cancelPending = useCallback(() => {
    const current = pending
    setPending(null)
    if (!current) return
    if (current.reason === 'stop') {
      const stamp = Date.now()
      setRuntime(resume(current.runtime, stamp))
      setNow(stamp)
      handledSessionRef.current = ''
    }
  }, [pending])

  /** 放弃：不写时间块，回到空闲态 */
  const abandonPending = useCallback(() => {
    const current = pending?.runtime ?? runtimeRef.current
    setPending(null)
    setLastLog(null)
    handledSessionRef.current = ''
    if (!current) {
      setRuntime(null)
      clearRuntimeStorage()
      return
    }
    const stamp = Date.now()
    setRuntime(reset(current, stamp, uid()))
    setNow(stamp)
  }, [pending, clearRuntimeStorage])

  const resetTimer = useCallback(() => {
    const current = runtimeRef.current
    setPending(null)
    setLastLog(null)
    handledSessionRef.current = ''
    if (!current) return
    const stamp = Date.now()
    setRuntime(reset(current, stamp, uid()))
    setNow(stamp)
  }, [])

  const undoLastLog = useCallback(() => {
    if (!lastLog) return
    lastLog.ids.forEach(id => deleteRef.current(id))
    const current = runtimeRef.current
    if (current && current.sessionId === lastLog.sessionId) {
      setRuntime({ ...current, writtenBlockId: undefined })
    }
    setLastLog(null)
  }, [lastLog])

  const clearNotice = useCallback(() => setNotice(''), [])

  return {
    runtime,
    now,
    pending,
    lastLog,
    notice,
    startNew,
    pauseTimer,
    resumeTimer,
    requestStop,
    confirmPending,
    cancelPending,
    abandonPending,
    resetTimer,
    undoLastLog,
    clearNotice,
  }
}
