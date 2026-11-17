import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PLANNED_MS,
  LATE_END_TOLERANCE_MS,
  MAX_SESSION_MS,
  createSession,
  elapsedMs,
  formatClock,
  formatHours,
  localDateKey,
  pause,
  remainingMs,
  reset,
  restoreRuntime,
  resume,
  sessionBlockId,
  sessionRefId,
  splitAcrossMidnight,
  start,
  stop,
  toTimeBlockDraft,
} from './timerMachine'
import type { TimerRuntime } from './timerMachine'

const at = (day: number, hour: number, minute = 0, second = 0): number =>
  new Date(2026, 0, day, hour, minute, second).getTime()

const base: Parameters<typeof createSession>[0] = {
  sessionId: 's1',
  mode: 'countdown',
  owner: 'local',
  ownerTabId: 'tab-1',
  now: at(1, 9),
  plannedMs: 25 * 60 * 1000,
  title: '写方案',
  category: '学习',
}

const countdown = (patch: Partial<TimerRuntime> = {}): TimerRuntime => ({
  ...start(createSession(base), base.now),
  ...patch,
})

const stopwatch = (now = at(1, 9), patch: Partial<TimerRuntime> = {}): TimerRuntime => ({
  ...start(createSession({ ...base, mode: 'stopwatch', now }), now),
  ...patch,
})

describe('createSession / start', () => {
  it('倒计时创建后是空闲态，剩余等于目标时长', () => {
    const state = createSession(base)
    expect(state.status).toBe('idle')
    expect(state.plannedMs).toBe(25 * 60 * 1000)
    expect(state.endAt).toBeUndefined()
    expect(remainingMs(state, base.now)).toBe(25 * 60 * 1000)
    expect(state.dateKey).toBe('2026-01-01')
  })

  it('非法目标时长回落到默认 25 分钟', () => {
    expect(createSession({ ...base, plannedMs: Number.NaN }).plannedMs).toBe(DEFAULT_PLANNED_MS)
    expect(createSession({ ...base, plannedMs: 0 }).plannedMs).toBe(DEFAULT_PLANNED_MS)
    expect(createSession({ ...base, plannedMs: MAX_SESSION_MS * 3 }).plannedMs).toBe(MAX_SESSION_MS)
  })

  it('开始时写入绝对结束时间戳', () => {
    const state = start(createSession(base), base.now)
    expect(state.status).toBe('running')
    expect(state.endAt).toBe(base.now + 25 * 60 * 1000)
    expect(remainingMs(state, base.now + 5 * 60 * 1000)).toBe(20 * 60 * 1000)
  })

  it('已结束的会话不能被 start 复活', () => {
    const ended = stop(countdown(), at(1, 9, 10))
    expect(start(ended, at(1, 9, 11))).toBe(ended)
  })
})

describe('倒计时：剩余与已用时长', () => {
  it('运行中按 endAt - now 现算，不依赖递减计数', () => {
    const state = countdown()
    expect(remainingMs(state, at(1, 9, 10))).toBe(15 * 60 * 1000)
    expect(elapsedMs(state, at(1, 9, 10))).toBe(10 * 60 * 1000)
    expect(remainingMs(state, at(1, 12))).toBe(0)
    expect(elapsedMs(state, at(1, 12))).toBe(25 * 60 * 1000)
  })

  it('暂停存剩余毫秒，继续时用 now + 剩余重算 endAt', () => {
    const running = countdown()
    const paused = pause(running, at(1, 9, 10))
    expect(paused.status).toBe('paused')
    expect(paused.endAt).toBeUndefined()
    expect(paused.remainingMs).toBe(15 * 60 * 1000)
    expect(remainingMs(paused, at(1, 9, 40))).toBe(15 * 60 * 1000)

    const resumed = resume(paused, at(1, 9, 40))
    expect(resumed.status).toBe('running')
    expect(resumed.endAt).toBe(at(1, 9, 55))
    expect(remainingMs(resumed, at(1, 9, 45))).toBe(10 * 60 * 1000)
  })
})

describe('正计时：累计 + 当前运行段', () => {
  it('暂停累计、继续续计', () => {
    const running = stopwatch()
    expect(elapsedMs(running, at(1, 9, 10))).toBe(10 * 60 * 1000)

    const paused = pause(running, at(1, 9, 10))
    expect(paused.status).toBe('paused')
    expect(paused.accumulatedMs).toBe(10 * 60 * 1000)
    expect(elapsedMs(paused, at(1, 10))).toBe(10 * 60 * 1000)

    const resumed = resume(paused, at(1, 9, 20))
    expect(elapsedMs(resumed, at(1, 9, 30))).toBe(20 * 60 * 1000)
  })

  it('时钟回拨（now < resumedAt）时当前段按 0 计，不出现负数', () => {
    const running = stopwatch()
    expect(elapsedMs(running, at(1, 8))).toBe(0)
  })
})

describe('stop / reset', () => {
  it('倒计时自然结束后已用 = 目标时长', () => {
    const ended = stop(countdown(), at(1, 10))
    expect(ended.status).toBe('ended')
    expect(ended.finalElapsedMs).toBe(25 * 60 * 1000)
    expect(ended.endedAt).toBe(base.now + 25 * 60 * 1000)
    expect(elapsedMs(ended, at(1, 11))).toBe(25 * 60 * 1000)
  })

  it('倒计时提前停止保留实际已用时长', () => {
    const ended = stop(countdown(), at(1, 9, 10))
    expect(ended.finalElapsedMs).toBe(10 * 60 * 1000)
    expect(ended.endedAt).toBe(at(1, 9, 10))
  })

  it('正计时停止固化累计值，之后不再随时钟增长', () => {
    const ended = stop(stopwatch(), at(1, 9, 30))
    expect(ended.finalElapsedMs).toBe(30 * 60 * 1000)
    expect(elapsedMs(ended, at(1, 12))).toBe(30 * 60 * 1000)
  })

  it('重置生成新 sessionId 的空闲态', () => {
    const next = reset(countdown(), at(1, 9, 30), 's2')
    expect(next.sessionId).toBe('s2')
    expect(next.status).toBe('idle')
    expect(next.writtenBlockId).toBeUndefined()
    expect(next.mode).toBe('countdown')
    expect(next.plannedMs).toBe(25 * 60 * 1000)
  })
})

describe('restoreRuntime：刷新 / 关页重进', () => {
  const raw = (patch: Partial<TimerRuntime> = {}) => JSON.parse(JSON.stringify({ ...countdown(), ...patch }))

  it('运行中的倒计时原样恢复，剩余仍由 endAt 推导', () => {
    const result = restoreRuntime(raw(), at(1, 9, 5), 'local')
    expect(result.runtime?.status).toBe('running')
    expect(result.lateEnded).toBe(false)
    expect(remainingMs(result.runtime!, at(1, 9, 5))).toBe(20 * 60 * 1000)
  })

  it('迟到 ≤60 秒结束：整理为已结束，但不要求确认', () => {
    const result = restoreRuntime(raw(), base.now + 25 * 60 * 1000 + 30 * 1000, 'local')
    expect(result.runtime?.status).toBe('ended')
    expect(result.runtime?.finalElapsedMs).toBe(25 * 60 * 1000)
    expect(result.lateEnded).toBe(false)
  })

  it('迟到 >60 秒结束：标记 lateEnded，等页面确认', () => {
    const result = restoreRuntime(raw(), base.now + 25 * 60 * 1000 + LATE_END_TOLERANCE_MS + 1, 'local')
    expect(result.runtime?.status).toBe('ended')
    expect(result.lateEnded).toBe(true)
  })

  it('已结束但写过的会话不再要求确认', () => {
    const result = restoreRuntime(
      raw({ writtenBlockId: 'tb_s1' }),
      base.now + 25 * 60 * 1000 + LATE_END_TOLERANCE_MS + 1,
      'local',
    )
    expect(result.lateEnded).toBe(false)
  })

  it('结束超过 24 小时：丢弃运行态', () => {
    const result = restoreRuntime(raw(), base.now + 25 * 60 * 1000 + 24 * 60 * 60 * 1000 + 1, 'local')
    expect(result.runtime).toBeNull()
    expect(result.expired).toBe(true)
  })

  it('owner 不一致：丢弃且不返回运行态', () => {
    const result = restoreRuntime(raw(), at(1, 9, 5), 'user-A')
    expect(result.runtime).toBeNull()
    expect(result.ownerMismatch).toBe(true)
  })

  it('脏数据（非对象 / 版本不符 / 缺 sessionId / 状态非法）全部丢弃', () => {
    expect(restoreRuntime(null, at(1, 9)).runtime).toBeNull()
    expect(restoreRuntime({ ...raw(), v: 2 }, at(1, 9)).runtime).toBeNull()
    expect(restoreRuntime({ ...raw(), sessionId: '' }, at(1, 9)).runtime).toBeNull()
    expect(restoreRuntime({ ...raw(), status: 'weird' }, at(1, 9)).runtime).toBeNull()
  })

  it('缺 endAt 的运行中倒计时退回暂停态，不猜测剩余', () => {
    const result = restoreRuntime(raw({ endAt: undefined }), at(1, 9, 5), 'local')
    expect(result.runtime?.status).toBe('paused')
    expect(result.runtime?.remainingMs).toBe(25 * 60 * 1000)
  })

  it('系统时间回拨导致 endAt 超过目标时长时夹回', () => {
    const future = at(2, 9)
    const result = restoreRuntime(raw({ endAt: future }), at(1, 9, 5), 'local')
    expect(result.runtime?.endAt).toBe(at(1, 9, 5) + 25 * 60 * 1000)
    expect(remainingMs(result.runtime!, at(1, 9, 5))).toBe(25 * 60 * 1000)
  })

  it('正计时超过 24 小时：夹回上限并暂停', () => {
    const running = stopwatch(at(1, 0))
    const result = restoreRuntime(JSON.parse(JSON.stringify(running)), at(2, 1), 'local')
    expect(result.capped).toBe(true)
    expect(result.runtime?.status).toBe('paused')
    expect(result.runtime?.accumulatedMs).toBe(MAX_SESSION_MS)
  })
})

describe('splitAcrossMidnight：跨零点', () => {
  it('单日区间不拆', () => {
    const segments = splitAcrossMidnight(at(1, 9), 90 * 60 * 1000)
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ date: '2026-01-01', start: 9, end: 10.5, index: 1 })
  })

  it('跨零点拆两条，end 不超过 24', () => {
    const segments = splitAcrossMidnight(at(1, 23, 30), 90 * 60 * 1000)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ date: '2026-01-01', start: 23.5, end: 24, index: 1 })
    expect(segments[1]).toMatchObject({ date: '2026-01-02', start: 0, end: 1, index: 2 })
    segments.forEach(segment => expect(segment.end).toBeLessThanOrEqual(24))
  })

  it('非法入参返回空数组', () => {
    expect(splitAcrossMidnight(Number.NaN, 1000)).toEqual([])
    expect(splitAcrossMidnight(at(1, 9), 0)).toEqual([])
  })
})

describe('toTimeBlockDraft：写入草稿', () => {
  it('单日会话生成一条，主键与 ref_id 都带 sessionId', () => {
    const ended = stop(countdown(), at(1, 9, 25))
    const drafts = toTimeBlockDraft(ended, at(1, 9, 25))
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      id: 'tb_s1',
      date: '2026-01-01',
      start: 9,
      end: 9.4167,
      source: 'timer',
      ref_type: 'timer',
      ref_id: 's1',
      title: '写方案',
      category: '学习',
    })
    expect(drafts[0].duration).toBeCloseTo(25 / 60, 4)
  })

  it('跨零点生成两条，ref_id 加 #1/#2，且不产生 end>24', () => {
    const running = start(
      createSession({ ...base, now: at(1, 23, 30), plannedMs: 90 * 60 * 1000 }),
      at(1, 23, 30),
    )
    const ended = stop(running, at(2, 1))
    const drafts = toTimeBlockDraft(ended, at(2, 1))
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ id: 'tb_s1#1', ref_id: 's1#1', date: '2026-01-01', start: 23.5, end: 24 })
    expect(drafts[1]).toMatchObject({ id: 'tb_s1#2', ref_id: 's1#2', date: '2026-01-02', start: 0, end: 1 })
    drafts.forEach(draft => expect(draft.end).toBeLessThanOrEqual(24))
  })

  it('暂停时间被压缩：end - start 恒等于实际已用时长', () => {
    const running = stopwatch(at(1, 9))
    const paused = pause(running, at(1, 9, 10))
    const resumed = resume(paused, at(1, 9, 20))
    const ended = stop(resumed, at(1, 9, 30))
    const drafts = toTimeBlockDraft(ended, at(1, 9, 30))
    expect(drafts).toHaveLength(1)
    expect(drafts[0].start).toBeCloseTo(9.1667, 4)
    expect(drafts[0].end).toBeCloseTo(9.5, 4)
    expect(drafts[0].duration).toBeCloseTo(20 / 60, 4)
  })

  it('不足 1 秒不产生时间块', () => {
    const ended = stop(stopwatch(), at(1, 9) + 500)
    expect(toTimeBlockDraft(ended, at(1, 9) + 500)).toEqual([])
  })

  it('标题为空时回落到分类名', () => {
    const ended = stop(countdown({ title: '' }), at(1, 9, 5))
    expect(toTimeBlockDraft(ended, at(1, 9, 5))[0].title).toBe('学习')
  })
})

describe('id / 格式化辅助', () => {
  it('sessionBlockId 与 sessionRefId 的单段/分段规则一致', () => {
    expect(sessionBlockId('s1')).toBe('tb_s1')
    expect(sessionBlockId('s1', 2)).toBe('tb_s1#2')
    expect(sessionRefId('s1')).toBe('s1')
    expect(sessionRefId('s1', 2)).toBe('s1#2')
  })

  it('formatClock 不足 1 小时显示 MM:SS，超过显示 H:MM:SS', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65 * 1000)).toBe('01:05')
    expect(formatClock(65 * 60 * 1000 + 1000)).toBe('1:05:01')
  })

  it('formatHours 把十进制小时转成 HH:MM', () => {
    expect(formatHours(9.5)).toBe('09:30')
    expect(formatHours(24)).toBe('24:00')
    expect(formatHours(-1)).toBe('00:00')
  })

  it('localDateKey 使用本地时区', () => {
    expect(localDateKey(at(1, 23, 59))).toBe('2026-01-01')
    expect(localDateKey(at(2, 0, 1))).toBe('2026-01-02')
  })
})
