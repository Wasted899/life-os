import { useState } from 'react'
import dayjs from 'dayjs'
import type { Category, TimeBlock } from '../../../core/types'
import Modal from '../../../core/ui/Modal'
import { formatDuration, formatRawHour, parseHourInput } from '../model/format'

export interface RecordFormValues {
  title: string
  date: string
  start: number
  end: number
  category: string
}

interface Props {
  mode: 'create' | 'edit'
  initial: TimeBlock | null
  defaultDate: string
  categories: Category[]
  onSave: (values: RecordFormValues) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function RecordFormModal({
  mode,
  initial,
  defaultDate,
  categories,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? defaultDate)
  const [startText, setStartText] = useState(formatRawHour(initial?.start ?? 9))
  const [endText, setEndText] = useState(formatRawHour(initial?.end ?? 10))
  const [category, setCategory] = useState(initial?.category?.trim() || categories[0]?.name || '未分类')
  const [error, setError] = useState('')

  const start = parseHourInput(startText)
  const end = parseHourInput(endText)
  const duration = start !== null && end !== null && end > start ? end - start : null

  const categoryOptions = categories.some(item => item.name === category)
    ? categories
    : [{ id: '__current__', name: category, color: '#94a3b8' }, ...categories]

  const handleSave = () => {
    if (!title.trim()) {
      setError('请填写做了什么')
      return
    }
    if (!dayjs(date).isValid()) {
      setError('日期不合法')
      return
    }
    if (start === null || end === null) {
      setError('时间格式应为 HH:mm，例如 09:30')
      return
    }
    if (start < 0 || start >= 24) {
      setError('开始时间必须在 00:00 到 23:59 之间')
      return
    }
    if (end > 24) {
      setError('结束时间不能超过 24:00')
      return
    }
    if (end <= start) {
      setError('结束时间必须晚于开始时间')
      return
    }
    onSave({ title: title.trim(), date, start, end, category })
  }

  return (
    <Modal
      open
      title={`${mode === 'edit' ? '编辑' : '添加'}时间记录`}
      onClose={onClose}
      actions={
        <>
          {mode === 'edit' && initial && (
            <button
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (confirm('确定删除这条时间记录？')) onDelete(initial.id)
              }}
            >
              删除
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存</button>
        </>
      }
    >
      <div className="ts-form">
        <label className="ts-field">
          <span>做了什么</span>
          <input
            className="input"
            placeholder="例如：复习线性代数"
            value={title}
            onChange={event => setTitle(event.target.value)}
            autoFocus
          />
        </label>
        <label className="ts-field">
          <span>日期</span>
          <input className="input" type="date" value={date} onChange={event => setDate(event.target.value)} />
        </label>
        <div className="ts-field-row">
          <label className="ts-field">
            <span>开始</span>
            <input
              className="input"
              value={startText}
              onChange={event => setStartText(event.target.value)}
              placeholder="09:00"
              inputMode="numeric"
            />
          </label>
          <label className="ts-field">
            <span>结束</span>
            <input
              className="input"
              value={endText}
              onChange={event => setEndText(event.target.value)}
              placeholder="10:00"
              inputMode="numeric"
            />
          </label>
        </div>
        <div className="ts-hint">
          格式 HH:mm，最晚 24:00{duration !== null ? `，本次 ${formatDuration(duration)}` : ''}
        </div>
        <label className="ts-field">
          <span>分类</span>
          <select className="select" value={category} onChange={event => setCategory(event.target.value)}>
            {categoryOptions.map(item => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
        {error && <div className="ts-form-error">{error}</div>}
      </div>
    </Modal>
  )
}
