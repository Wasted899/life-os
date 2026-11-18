import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { Modal } from '../../core/ui/Modal'
import { load, save } from '../../core/storage'
import { useData } from '../../context/DataContext'
import {
  DEFAULT_PLANNED_MS,
  formatClock,
  formatHours,
  presetMinutes,
  remainingMs,
  elapsedMs,
} from './model/timerMachine'
import type { TimerMode } from './model/timerMachine'
import {
  DEFAULT_TIMER_CATEGORIES,
  FALLBACK_TIMER_CATEGORY,
  TIMER_CATEGORY_KEY,
  addTimerCategory,
  normalizeTimerCategories,
  removeTimerCategory,
  renameTimerCategory,
} from './model/timerCategories'
import { POMODORO_RUNTIME_KEY, useTimerRuntime } from './useTimerRuntime'
import { TimerCompleteModal } from './TimerCompleteModal'
import './timer.css'

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

const minutesBetween = (start: number, end: number): number =>
  Math.max(0, Math.round((end - start) * 60))

export default function TimerPage() {
  const { timeBlocks } = useData()
  const timer = useTimerRuntime({ conflictRuntimeKey: POMODORO_RUNTIME_KEY })

  const [mode, setMode] = useState<TimerMode>('countdown')
  const [minutes, setMinutes] = useState(25)
  const [title, setTitle] = useState('')
  const [categories, setCategories] = useState<string[]>(() =>
    normalizeTimerCategories(load<string[]>(TIMER_CATEGORY_KEY, DEFAULT_TIMER_CATEGORIES)),
  )
  const [category, setCategory] = useState(() => {
    const initial = normalizeTimerCategories(load<string[]>(TIMER_CATEGORY_KEY, DEFAULT_TIMER_CATEGORIES))
    return initial[0] ?? FALLBACK_TIMER_CATEGORY
  })

  const [catOpen, setCatOpen] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [catError, setCatError] = useState('')
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null)

  // 不引入外部音频：用 AudioContext 三连音；必须在用户手势里初始化/恢复
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

  const active = timer.runtime && timer.runtime.status !== 'idle' ? timer.runtime : null
  const displayMode: TimerMode = active ? active.mode : mode
  const status = timer.runtime?.status ?? 'idle'
  /** 运行/暂停时锁住模式与输入；结束态允许直接开始下一次 */
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

  const today = dayjs().format('YYYY-MM-DD')
  const todayBlocks = useMemo(
    () =>
      timeBlocks
        .filter(block => block.source === 'timer' && block.date === today)
        .slice()
        .sort((a, b) => b.start - a.start),
    [timeBlocks, today],
  )

  useEffect(() => {
    save(TIMER_CATEGORY_KEY, categories)
  }, [categories])

  useEffect(() => {
    if (categories.includes(category)) return
    setCategory(categories[0] ?? FALLBACK_TIMER_CATEGORY)
  }, [categories, category])

  // 只在「运行中 → 已结束」这一跳响铃，刷新恢复到结束态不补响
  const previousStatus = useRef(status)
  useEffect(() => {
    if (previousStatus.current === 'running' && status === 'ended') playChime()
    previousStatus.current = status
  }, [status])

  const statusText = (() => {
    if (status === 'running') return displayMode === 'countdown' ? '倒计时中' : '正计时中'
    if (status === 'paused') return '已暂停'
    if (status === 'ended') return '已结束'
    return '准备开始'
  })()

  const canEditPlan = !locked

  const handleStart = () => {
    ensureAudio()
    timer.startNew({
      mode,
      plannedMs: Math.max(1, minutes) * 60000,
      title: title.trim(),
      category,
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

  const primaryLabel = status === 'running' ? '暂停' : status === 'paused' ? '继续' : status === 'ended' ? '再来一次' : '开始'

  const applyCategory = (result: { ok: boolean; list: string[]; error?: string }, success?: () => void) => {
    if (!result.ok) {
      setCatError(result.error ?? '操作失败')
      return
    }
    setCategories(result.list)
    setCatError('')
    success?.()
  }

  const handleAddCategory = () => {
    applyCategory(addTimerCategory(categories, newCat), () => {
      setNewCat('')
    })
  }

  const handleRenameCategory = () => {
    if (!renaming) return
    const from = renaming.from
    applyCategory(renameTimerCategory(categories, from, renaming.value), () => {
      if (category === from) setCategory(renaming.value.trim())
      setRenaming(null)
    })
  }

  const handleRemoveCategory = (name: string) => {
    applyCategory(removeTimerCategory(categories, name), () => {
      if (category === name) setCategory(FALLBACK_TIMER_CATEGORY)
    })
  }

  const pendingDefaults = timer.pending
    ? {
        minutes: Math.max(1, Math.round(timer.pending.elapsedMs / 60000)),
        maxMinutes: timer.pending.reason === 'late'
          ? Math.max(1, Math.round((timer.pending.runtime.plannedMs ?? DEFAULT_PLANNED_MS) / 60000))
          : 24 * 60,
        title: timer.pending.runtime.title,
        category: timer.pending.runtime.category,
      }
    : null

  return (
    <div className="timer-page">
      <div className="card timer-panel">
        <div className="timer-top">
          <div className="timer-mode" role="tablist" aria-label="计时模式">
            <button
              type="button"
              className={`timer-mode-btn${displayMode === 'countdown' ? ' active' : ''}`}
              disabled={locked}
              onClick={() => setMode('countdown')}
            >
              倒计时
            </button>
            <button
              type="button"
              className={`timer-mode-btn${displayMode === 'stopwatch' ? ' active' : ''}`}
              disabled={locked}
              onClick={() => setMode('stopwatch')}
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
              {displayMode === 'countdown' ? `目标 ${Math.round(plannedMs / 60000)} 分钟` : '已计时'}
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
            <span>已记录 {timer.lastLog.minutes} 分钟到时间统计</span>
            <button type="button" className="btn" onClick={timer.undoLastLog}>撤销</button>
          </div>
        ) : null}

        {canEditPlan ? (
          <div className="timer-presets">
            {presetMinutes.map(value => (
              <button
                key={value}
                type="button"
                className={`timer-preset${minutes === value ? ' active' : ''}`}
                onClick={() => setMinutes(value)}
              >
                {value} 分
              </button>
            ))}
            <input
              className="input timer-minutes"
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={event => setMinutes(Math.min(1440, Math.max(1, Number(event.target.value) || 1)))}
              aria-label="自定义分钟数"
            />
          </div>
        ) : null}

        <div className="timer-fields">
          <input
            className="input"
            value={title}
            placeholder="本次计时做什么？（选填）"
            disabled={locked}
            onChange={event => setTitle(event.target.value)}
          />
          <div className="timer-category-row">
            <select
              className="select"
              value={category}
              disabled={locked}
              onChange={event => setCategory(event.target.value)}
            >
              {categories.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => setCatOpen(true)}>分类管理</button>
          </div>
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
          <strong>今日计时记录</strong>
          <Link className="timer-link" to="/time">去时间统计</Link>
        </div>
        {todayBlocks.length === 0 ? (
          <div className="empty">今天还没有计时记录</div>
        ) : (
          <div className="timer-record-list">
            {todayBlocks.map(block => (
              <div key={block.id} className="timer-record">
                <div className="timer-record-main">
                  <span className="timer-record-title">{block.title}</span>
                  <span className="tag">{block.category}</span>
                </div>
                <span className="timer-record-time">
                  {formatHours(block.start)} - {formatHours(block.end)}
                  <em>{minutesBetween(block.start, block.end)} 分钟</em>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <TimerCompleteModal
        open={!!timer.pending}
        reason={timer.pending?.reason ?? 'stop'}
        defaultMinutes={pendingDefaults?.minutes ?? 1}
        maxMinutes={pendingDefaults?.maxMinutes ?? 1440}
        initialTitle={pendingDefaults?.title ?? ''}
        initialCategory={pendingDefaults?.category ?? category}
        categories={categories}
        onConfirm={value => timer.confirmPending(value.minutes, { title: value.title, category: value.category })}
        onCancel={timer.cancelPending}
        onAbandon={timer.abandonPending}
      />

      <Modal
        open={catOpen}
        title="计时器分类"
        onClose={() => setCatOpen(false)}
        actions={<button type="button" className="btn" onClick={() => setCatOpen(false)}>完成</button>}
      >
        <div className="timer-page">
          <div className="timer-cat-list">
            {categories.map(name => (
              <div key={name} className="timer-cat-row">
                <input
                  className="input"
                  value={renaming?.from === name ? renaming.value : name}
                  disabled={name === FALLBACK_TIMER_CATEGORY}
                  onChange={event =>
                    setRenaming({ from: name, value: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="btn"
                  disabled={name === FALLBACK_TIMER_CATEGORY}
                  onClick={() => {
                    if (renaming?.from !== name || !renaming.value.trim() || renaming.value.trim() === name) {
                      setRenaming(null)
                      return
                    }
                    handleRenameCategory()
                  }}
                >
                  改名
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={name === FALLBACK_TIMER_CATEGORY}
                  onClick={() => handleRemoveCategory(name)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
          <div className="timer-cat-add">
            <input
              className="input"
              value={newCat}
              placeholder="新分类名"
              onChange={event => setNewCat(event.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={handleAddCategory}>新增</button>
          </div>
          {catError ? <div className="timer-error">{catError}</div> : null}
          <p className="timer-modal-hint">分类只保存在本机；改名不会回溯修改已写入的时间块。</p>
        </div>
      </Modal>
    </div>
  )
}
