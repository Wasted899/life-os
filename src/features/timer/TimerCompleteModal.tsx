import { useEffect, useState } from 'react'
import { Modal } from '../../core/ui/Modal'

export interface TimerCompleteValue {
  minutes: number
  title: string
  category: string
}

export interface TimerCompleteModalProps {
  open: boolean
  reason: 'late' | 'stop'
  defaultMinutes: number
  maxMinutes: number
  initialTitle: string
  initialCategory: string
  categories: string[]
  onConfirm: (value: TimerCompleteValue) => void
  onCancel: () => void
  onAbandon: () => void
}

/**
 * 计时器结束确认框。
 * 不复用 CompleteTimeModal：那个只能返回分钟，无法编辑标题/分类，也没有「放弃」出口。
 */
export function TimerCompleteModal({
  open,
  reason,
  defaultMinutes,
  maxMinutes,
  initialTitle,
  initialCategory,
  categories,
  onConfirm,
  onCancel,
  onAbandon,
}: TimerCompleteModalProps) {
  const [minutes, setMinutes] = useState(String(defaultMinutes))
  const [title, setTitle] = useState(initialTitle)
  const [category, setCategory] = useState(
    categories.includes(initialCategory) ? initialCategory : categories[0] ?? '其他',
  )
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setMinutes(String(defaultMinutes))
    setTitle(initialTitle)
    setCategory(categories.includes(initialCategory) ? initialCategory : categories[0] ?? '其他')
    setError('')
  }, [open, defaultMinutes, initialTitle, initialCategory, categories])

  const submit = () => {
    const value = Number(minutes)
    if (!Number.isFinite(value) || value <= 0) {
      setError('请输入大于 0 的分钟数')
      return
    }
    if (value > maxMinutes) {
      setError(`最多记录 ${maxMinutes} 分钟`)
      return
    }
    onConfirm({ minutes: Math.round(value), title: title.trim(), category })
  }

  return (
    <Modal
      open={open}
      title={reason === 'late' ? '计时已结束' : '结束本次计时'}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn" onClick={onAbandon}>
            放弃，不记录
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            记录
          </button>
        </>
      }
    >
      <div className="timer-page">
        <p className="timer-modal-hint">
          {reason === 'late'
            ? '离开期间倒计时已经结束。确认后按下面的时长写入时间统计。'
            : '停止后按下面的时长写入时间统计，可先手动修正。'}
        </p>
        <label className="timer-field">
          <span>时长（分钟）</span>
          <input
            className="input"
            type="number"
            min={1}
            max={maxMinutes}
            value={minutes}
            onChange={event => setMinutes(event.target.value)}
          />
        </label>
        <label className="timer-field">
          <span>标题</span>
          <input
            className="input"
            value={title}
            placeholder="留空则使用分类名"
            onChange={event => setTitle(event.target.value)}
          />
        </label>
        <label className="timer-field">
          <span>分类</span>
          <select className="select" value={category} onChange={event => setCategory(event.target.value)}>
            {categories.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        {error ? <div className="timer-error">{error}</div> : null}
      </div>
    </Modal>
  )
}

export default TimerCompleteModal
