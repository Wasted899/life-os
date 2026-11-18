import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import dayjs from 'dayjs'
import { useData } from '../../context/DataContext'
import { formatClock, presetMinutes, remainingMs, elapsedMs, DEFAULT_PLANNED_MS } from '../timer/model/timerMachine'
import type { TimerMode } from '../timer/model/timerMachine'
import { TIMER_RUNTIME_KEY, POMODORO_RUNTIME_KEY, useTimerRuntime } from '../timer/useTimerRuntime'
import type { TimerLastLog } from '../timer/useTimerRuntime'
import { TimerCompleteModal } from '../timer/TimerCompleteModal'
import '../timer/timer.css'

const FOCUS_CATEGORY = '专注'
// 稳定引用：TimerCompleteModal 的 effect 依赖 categories，新建数组会重置用户正在输入的内容
const POMODORO_CATEGORIES: string[] = [FOCUS_CATEGORY]
const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

export default function PomodoroPage() {
  const { pomodoros, addPomodoro, deletePomodoro, todos } = useData()

  const [mode, setMode] = useState<TimerMode>('countdown')
  const [minutes, setMinutes] = useState(25)
  const [todoId, setTodoId] = useState('')
  const [statView, setStatView] = useState<'day' | 'week' | 'month' | 'year'>('week')

  const activeTodos = useMemo(() => todos.filter(todo => !todo.completed), [todos])
  const selectedTodo = activeTodos.find(todo => todo.id === todoId)

  // 铃声只在「运行中 → 已结束」这一跳触发；AudioContext 必须在用户手势里初始化
  const audioRef = useRef<AudioContext | null>(null)
  const ensureAudio = () => {
    if (typeof window === 'undefined') return
    if (!audioRef.current) {
      const Ctor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) audioRef.current = new Ctor()
    }
    void audioRef.current?.resume()
  }
  const playChime = () => {
    const context = audioRef.current
    if (!context) return
    const start = context.currentTime
    ;[0, 0.2, 0.4].forEach(offset => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.24, start + offset + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start + offset)
      oscillator.stop(start + offset + 0.2)
    })
  }

  const onLogged = (log: TimerLastLog, runtime: { dateKey: string; title: string; mode: TimerMode; linkedTodoId?: string; todoLabel?: string }) => {
    // 不足 1 分钟的会话只留时间块，不计番茄个数
    if (log.minutes < 1) return
    const label = runtime.title || runtime.todoLabel || FOCUS_CATEGORY
    addPomodoro({
      id: `pm_${log.sessionId}`,
      date: runtime.dateKey || dayjs().format('YYYY-MM-DD'),
      duration: log.minutes,
      task: label,
      completed: true,
      mode: runtime.mode,
      task_label: label,
      ...(runtime.linkedTodoId ? { task_id: runtime.linkedTodoId } : {}),
    })
  }

  const timer = useTimerRuntime({
    runtimeKey: POMODORO_RUNTIME_KEY,
    conflictRuntimeKey: TIMER_RUNTIME_KEY,
    source: 'pomodoro',
    refType: 'pomodoro',
    onLogged,
    onUndo: log => deletePomodoro(`pm_${log.sessionId}`),
  })

  const active = timer.runtime && timer.runtime.status !== 'idle' ? timer.runtime : null
  const displayMode: TimerMode = active ? active.mode : mode
  const status = timer.runtime?.status ?? 'idle'
  const locked = status === 'running' || status === 'paused'

  const plannedMs = active?.plannedMs ?? Math.max(1, minutes) * 60000
  const remaining = active
    ? active.mode === 'countdown'
      ? remainingMs(active, timer.now)
      : 0
    : plannedMs
  const elapsed = active ? elapsedMs(active, timer.now) : 0
  const displayMs = status === 'ended' ? elapsed : displayMode === 'countdown' ? remaining : elapsed

  const progress = displayMode === 'countdown'
    ? clampPercent(((plannedMs - remaining) / Math.max(1, plannedMs)) * 100)
    : clampPercent(((elapsed % 60000) / 60000) * 100)

  const previousStatus = useRef(status)
  useEffect(() => {
    if (previousStatus.current === 'running' && status === 'ended') playChime()
    previousStatus.current = status
  }, [status])

  const chooseMode = (next: TimerMode) => {
    if (status === 'ended') timer.resetTimer()
    setMode(next)
  }

  const chooseMinutes = (value: number) => {
    if (status === 'ended') timer.resetTimer()
    setMinutes(value)
  }

  const handleStart = () => {
    ensureAudio()
    const label = selectedTodo?.title || FOCUS_CATEGORY
    timer.startNew({
      mode,
      plannedMs: Math.max(1, minutes) * 60000,
      title: label,
      category: FOCUS_CATEGORY,
      linkedTodoId: selectedTodo?.id,
      todoLabel: selectedTodo?.title,
    })
  }

  const handlePrimary = () => {
    if (status === 'running') {
      timer.pauseTimer()
      return
    }
    if (status === 'paused') {
      ensureAudio()
      timer.resumeTimer()
      return
    }
    handleStart()
  }

  const primaryLabel = status === 'running' ? '暂停' : status === 'paused' ? '继续' : status === 'ended' ? '再来一次' : '开始专注'
  const statusText = (() => {
    if (status === 'running') return displayMode === 'countdown' ? '专注中' : '正计时中'
    if (status === 'paused') return '已暂停'
    if (status === 'ended') return '已完成'
    return '准备开始'
  })()

  // ---------- 统计：个数只算倒计时，时长两种模式都算 ----------
  const today = dayjs().format('YYYY-MM-DD')
  const todayRecords = pomodoros.filter(item => item.date === today)
  const todayCount = todayRecords.filter(item => item.mode === 'countdown').length
  const todayMinutes = todayRecords.reduce((sum, item) => sum + item.duration, 0)

  const weekData = Array.from({ length: 7 }).map((_, index) => {
    const date = dayjs().subtract(6 - index, 'day').format('YYYY-MM-DD')
    return pomodoros.filter(item => item.date === date).reduce((sum, item) => sum + item.duration, 0)
  })
  const weekMax = Math.max(...weekData, 1)

  const monthDays = Array.from({ length: 30 }).map((_, index) => {
    const date = dayjs().subtract(29 - index, 'day').format('YYYY-MM-DD')
    const count = pomodoros.filter(item => item.date === date && item.mode === 'countdown').length
    return { date, count }
  })

  const currentYear = dayjs().year()
  const yearData = Array.from({ length: 12 }).map((_, month) => {
    const minutesOfMonth = pomodoros
      .filter(item => dayjs(item.date).year() === currentYear && dayjs(item.date).month() === month)
      .reduce((sum, item) => sum + item.duration, 0)
    return { month, minutes: minutesOfMonth }
  })
  const yearMax = Math.max(...yearData.map(item => item.minutes), 1)

  const pendingDefaults = timer.pending
    ? {
        minutes: Math.max(1, Math.round(timer.pending.elapsedMs / 60000)),
        maxMinutes: timer.pending.reason === 'late'
          ? Math.max(1, Math.round((timer.pending.runtime.plannedMs ?? DEFAULT_PLANNED_MS) / 60000))
          : 24 * 60,
        title: timer.pending.runtime.title,
        category: FOCUS_CATEGORY,
      }
    : null

  return (
    <div className="timer-page">
      <div className="card timer-panel">
        <div className="timer-top">
          <div className="timer-mode" role="tablist" aria-label="专注模式">
            <button
              type="button"
              className={`timer-mode-btn${displayMode === 'countdown' ? ' active' : ''}`}
              disabled={locked}
              onClick={() => chooseMode('countdown')}
            >
              倒计时
            </button>
            <button
              type="button"
              className={`timer-mode-btn${displayMode === 'stopwatch' ? ' active' : ''}`}
              disabled={locked}
              onClick={() => chooseMode('stopwatch')}
            >
              正计时
            </button>
          </div>
          <span className="timer-status">{statusText}</span>
        </div>

        <div className="timer-ring-wrap">
          <div className="timer-ring" style={{ '--p': progress } as CSSProperties} aria-hidden="true" />
          <div className="timer-ring-inner">
            <div className="timer-clock">{formatClock(displayMs)}</div>
            <div className="timer-caption">
              {displayMode === 'countdown' ? `目标 ${Math.round(plannedMs / 60000)} 分钟` : '已专注'}
            </div>
          </div>
        </div>

        {timer.notice ? (
          <div className="timer-notice">
            <span>{timer.notice}</span>
            <button type="button" className="btn" onClick={timer.clearNotice}>知道了</button>
          </div>
        ) : null}

        {timer.lastLog ? (
          <div className="timer-notice">
            <span>
              {timer.lastLog.minutes > 0
                ? `已记录 ${timer.lastLog.minutes} 分钟专注到时间统计`
                : '已记录本次专注（不足 1 分钟）'}
            </span>
            <button type="button" className="btn" onClick={timer.undoLastLog}>撤销</button>
          </div>
        ) : null}

        {!locked ? (
          <div className="timer-presets">
            {presetMinutes.map(value => (
              <button
                key={value}
                type="button"
                className={`timer-preset${minutes === value ? ' active' : ''}`}
                onClick={() => chooseMinutes(value)}
              >
                {value} 分
              </button>
            ))}
          </div>
        ) : null}

        <div className="timer-fields">
          <select
            className="select"
            value={todoId}
            disabled={locked}
            onChange={event => setTodoId(event.target.value)}
            aria-label="绑定待办"
          >
            <option value="">不指定待办</option>
            {activeTodos.map(todo => (
              <option key={todo.id} value={todo.id}>{todo.title}</option>
            ))}
          </select>
        </div>

        <div className="timer-actions">
          <button
            type="button"
            className={`btn${status === 'running' ? '' : ' btn-primary'}`}
            onClick={handlePrimary}
          >
            {primaryLabel}
          </button>
          {status === 'running' || status === 'paused' ? (
            <button type="button" className="btn" onClick={timer.requestStop}>停止</button>
          ) : null}
          {status === 'paused' || status === 'ended' ? (
            <button type="button" className="btn" onClick={timer.resetTimer}>重置</button>
          ) : null}
        </div>
      </div>

      <div className="card timer-records">
        <div className="timer-records-head">
          <strong>专注统计</strong>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['day', 'week', 'month', 'year'] as const).map(view => (
              <button
                key={view}
                type="button"
                className={`btn ${statView === view ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setStatView(view)}
              >
                {view === 'day' ? '日' : view === 'week' ? '周' : view === 'month' ? '月' : '年'}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ background: '#f8fafc', margin: 0 }}>
          {statView === 'day' && (
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#ef4444' }}>{todayCount}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>今日番茄 · {todayMinutes} 分钟</div>
            </div>
          )}
          {statView === 'week' && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
              {weekData.map((value, index) => (
                <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{Math.round(value / 60)}h</div>
                  <div style={{ width: '100%', background: '#ef4444', borderRadius: '4px 4px 0 0', height: `${(value / weekMax) * 80}px`, minHeight: value > 0 ? 4 : 0 }} />
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{dayjs().subtract(6 - index, 'day').format('M/D')}</div>
                </div>
              ))}
            </div>
          )}
          {statView === 'month' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 3 }}>
              {monthDays.map(item => (
                <div
                  key={item.date}
                  title={`${item.date} · ${item.count} 个番茄`}
                  style={{
                    aspectRatio: '1',
                    background: item.count > 0 ? `rgba(239,68,68,${0.3 + Math.min(item.count, 5) / 5 * 0.7})` : '#f1f5f9',
                    borderRadius: 3,
                  }}
                />
              ))}
            </div>
          )}
          {statView === 'year' && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
              {yearData.map(item => (
                <div key={item.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', background: '#ef4444', borderRadius: '4px 4px 0 0', height: `${(item.minutes / yearMax) * 80}px`, minHeight: item.minutes > 0 ? 4 : 0 }} />
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>{item.month + 1}月</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TimerCompleteModal
        open={!!timer.pending}
        reason={timer.pending?.reason ?? 'stop'}
        defaultMinutes={pendingDefaults?.minutes ?? 1}
        maxMinutes={pendingDefaults?.maxMinutes ?? 1440}
        initialTitle={pendingDefaults?.title ?? ''}
        initialCategory={FOCUS_CATEGORY}
        categories={POMODORO_CATEGORIES}
        onConfirm={value => timer.confirmPending(value.minutes, { title: value.title, category: FOCUS_CATEGORY })}
        onCancel={timer.cancelPending}
        onAbandon={timer.abandonPending}
      />
    </div>
  )
}
