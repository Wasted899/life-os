import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import type { TimeBlock } from '../../../core/types'
import type { AbnormalReason } from '../../../core/timeRange'
import type { AbnormalHit, OverlapHit } from '../model/abnormal'
import { formatDuration, formatRawHour } from '../model/format'

const REASON_META: Array<{ key: AbnormalReason; label: string }> = [
  { key: 'end_over_24', label: '结束超过 24 点' },
  { key: 'end_not_after_start', label: '起止倒挂' },
  { key: 'start_out_of_range', label: '开始时间越界' },
  { key: 'non_numeric', label: '时间非数字' },
]

interface Props {
  open: boolean
  hits: AbnormalHit[]
  overlaps: OverlapHit[]
  initialDate?: string | null
  onClose: () => void
  onEdit: (block: TimeBlock) => void
  onDelete: (id: string) => void
}

export default function AbnormalDrawer({
  open,
  hits,
  overlaps,
  initialDate,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<'abnormal' | 'overlap'>('abnormal')
  const [reason, setReason] = useState<'all' | AbnormalReason>('all')
  const [dateFilter, setDateFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setTab('abnormal')
    setReason('all')
    setDateFilter(initialDate ?? '')
    setSelected(new Set())
  }, [open, initialDate])

  const dateMatched = useMemo(
    () => hits.filter(hit => !dateFilter || hit.block.date === dateFilter),
    [hits, dateFilter],
  )

  const abnormalRows = useMemo(
    () => dateMatched.filter(hit => reason === 'all' || hit.reasons.includes(reason)),
    [dateMatched, reason],
  )

  const overlapRows = useMemo(
    () => overlaps.filter(hit => !dateFilter || hit.date === dateFilter),
    [overlaps, dateFilter],
  )

  const reasonCounts = useMemo(() => {
    const counts = new Map<AbnormalReason, number>()
    for (const hit of dateMatched) {
      for (const item of hit.reasons) counts.set(item, (counts.get(item) ?? 0) + 1)
    }
    return counts
  }, [dateMatched])

  const toggle = (id: string) => {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBatchDelete = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`确定删除选中的 ${ids.length} 条异常记录？删除后不可恢复。`)) return
    ids.forEach(id => onDelete(id))
    setSelected(new Set())
  }

  const handleExport = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      abnormal: abnormalRows.map(hit => ({
        ...hit.block,
        reasons: hit.reasons,
        raw_span: hit.rawSpan,
        usable_span: hit.usableSpan,
      })),
      overlaps: overlapRows.map(hit => ({
        date: hit.date,
        block: hit.block,
        overlap_with: hit.overlapWith.id,
        overlap_hours: hit.overlapHours,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `time-abnormal-${dayjs().format('YYYYMMDD-HHmm')}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return createPortal(
    <div className="ts-drawer-overlay" onClick={onClose}>
      <aside className="ts-drawer" role="dialog" aria-modal="true" aria-label="数据体检" onClick={event => event.stopPropagation()}>
        <header className="ts-drawer-head">
          <div>
            <div className="ts-drawer-title">数据体检</div>
            <div className="ts-drawer-sub">
              {hits.length} 条异常未计入统计 · {overlaps.length} 条疑似重叠
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>关闭</button>
        </header>

        <div className="ts-drawer-toolbar">
          <div className="ts-tabs">
            <button
              type="button"
              className={tab === 'abnormal' ? 'is-active' : ''}
              onClick={() => setTab('abnormal')}
            >
              异常区间 {hits.length}
            </button>
            <button
              type="button"
              className={tab === 'overlap' ? 'is-active' : ''}
              onClick={() => setTab('overlap')}
            >
              疑似重叠 {overlaps.length}
            </button>
          </div>
          <div className="ts-drawer-filter">
            <input
              type="date"
              className="input ts-date-input"
              value={dateFilter}
              onChange={event => setDateFilter(event.target.value)}
            />
            {dateFilter && (
              <button type="button" className="btn btn-ghost ts-mini" onClick={() => setDateFilter('')}>全部日期</button>
            )}
          </div>
        </div>

        {tab === 'abnormal' && (
          <div className="ts-reason-chips">
            <button type="button" className={reason === 'all' ? 'is-active' : ''} onClick={() => setReason('all')}>
              全部 {dateMatched.length}
            </button>
            {REASON_META.map(item => (
              <button
                key={item.key}
                type="button"
                className={reason === item.key ? 'is-active' : ''}
                onClick={() => setReason(item.key)}
              >
                {item.label} {reasonCounts.get(item.key) ?? 0}
              </button>
            ))}
          </div>
        )}

        <div className="ts-drawer-body">
          {tab === 'abnormal' && abnormalRows.length === 0 && (
            <div className="empty">没有符合条件的异常记录</div>
          )}
          {tab === 'abnormal' && abnormalRows.map(hit => {
            const isSelected = selected.has(hit.block.id)
            return (
              <div key={hit.block.id} className={isSelected ? 'ts-ab-row is-selected' : 'ts-ab-row'}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(hit.block.id)}
                  aria-label={`选择 ${hit.block.title}`}
                />
                <div className="ts-ab-main">
                  <div className="ts-ab-title">
                    {hit.block.title || '未命名'}
                    <span className="ts-ab-date">{hit.block.date}</span>
                  </div>
                  <div className="ts-ab-meta">
                    <span className="ts-mono">{formatRawHour(hit.block.start)}–{formatRawHour(hit.block.end)}</span>
                    <span>声明 {formatDuration(hit.rawSpan)}</span>
                    <span>可计入 {formatDuration(hit.usableSpan)}</span>
                    <span>{hit.block.category?.trim() || '未分类'}</span>
                  </div>
                  <div className="ts-ab-reasons">
                    {hit.reasons.map(item => (
                      <span key={item} className="ts-reason-tag">
                        {REASON_META.find(meta => meta.key === item)?.label ?? item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ts-ab-actions">
                  <button type="button" className="btn btn-ghost ts-mini" onClick={() => onEdit(hit.block)}>编辑</button>
                  <button
                    type="button"
                    className="btn btn-ghost ts-mini ts-danger-text"
                    onClick={() => { if (confirm('确定删除这条异常记录？')) onDelete(hit.block.id) }}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}

          {tab === 'overlap' && overlapRows.length === 0 && (
            <div className="empty">没有疑似重叠记录</div>
          )}
          {tab === 'overlap' && overlapRows.length > 0 && (
            <div className="ts-overlap-hint">
              疑似重叠只作提示，不会自动删除。重叠可能来自重复完成、重复补录，删除前请确认保留哪一条。
            </div>
          )}
          {tab === 'overlap' && overlapRows.map(hit => (
            <div key={`${hit.date}-${hit.block.id}`} className="ts-ab-row">
              <div className="ts-ab-main">
                <div className="ts-ab-title">
                  {hit.block.title || '未命名'}
                  <span className="ts-ab-date">{hit.date}</span>
                </div>
                <div className="ts-ab-meta">
                  <span className="ts-mono">{formatRawHour(hit.block.start)}–{formatRawHour(hit.block.end)}</span>
                  <span>与「{hit.overlapWith.title || '未命名'}」重叠 {formatDuration(hit.overlapHours)}</span>
                </div>
              </div>
              <div className="ts-ab-actions">
                <button type="button" className="btn btn-ghost ts-mini" onClick={() => onEdit(hit.block)}>编辑</button>
                <button
                  type="button"
                  className="btn btn-ghost ts-mini ts-danger-text"
                  onClick={() => { if (confirm('确定删除这条记录？删除后重叠可能仍存在。')) onDelete(hit.block.id) }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>

        <footer className="ts-drawer-foot">
          <button type="button" className="btn btn-outline" onClick={handleExport}>导出 JSON</button>
          {tab === 'abnormal' && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={selected.size === 0}
              onClick={handleBatchDelete}
            >
              删除选中 {selected.size > 0 ? selected.size : ''}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>关闭</button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}
