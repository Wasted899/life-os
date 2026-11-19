import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import type { Category, TimeBlock } from '../../../core/types'
import { colorForCategory } from '../../../core/categoryColor'
import { classifyTimeBlock } from '../../../core/timeRange'
import { formatDuration, formatRawHour } from '../model/format'

const PAGE_SIZE = 100

const SOURCE_LABEL: Record<string, string> = {
  todo: '待办',
  habit: '习惯',
  pomodoro: '番茄',
  timer: '计时器',
  manual: '手动',
}

interface Props {
  blocks: TimeBlock[]
  categories: Category[]
  showDate: boolean
  selectedCategory: string | null
  onClearCategory: () => void
  onEdit: (block: TimeBlock) => void
  onDelete: (id: string) => void
  onBatchDelete: (ids: string[]) => void
}

export default function RecordsList({
  blocks,
  categories,
  showDate,
  selectedCategory,
  onClearCategory,
  onEdit,
  onDelete,
  onBatchDelete,
}: Props) {
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  const sorted = useMemo(
    () => [...blocks].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return a.start - b.start
    }),
    [blocks],
  )

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const toggle = (id: string) => {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(previous => previous.size === sorted.length ? new Set() : new Set(sorted.map(block => block.id)))
  }

  const exitBatch = () => {
    setBatchMode(false)
    setSelected(new Set())
  }

  const handleBatchDelete = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`确定删除选中的 ${ids.length} 条记录？删除后不可恢复。`)) return
    onBatchDelete(ids)
    exitBatch()
  }

  return (
    <div className="ts-records">
      <div className="ts-records-head">
        <div className="ts-records-title">
          记录明细
          <span className="ts-records-count">{sorted.length} 条</span>
          {selectedCategory && (
            <button type="button" className="ts-filter-chip" onClick={onClearCategory}>
              筛选：{selectedCategory} ×
            </button>
          )}
        </div>
        <div className="ts-records-actions">
          {batchMode && (
            <>
              <button type="button" className="btn btn-ghost ts-mini" onClick={toggleAll}>
                {selected.size === sorted.length ? '取消全选' : '全选'}
              </button>
              <button type="button" className="btn btn-danger ts-mini" disabled={selected.size === 0} onClick={handleBatchDelete}>
                删除 {selected.size > 0 ? selected.size : ''}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-outline ts-mini"
            onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
          >
            {batchMode ? '取消批量' : '批量'}
          </button>
        </div>
      </div>

      {visible.length === 0 && (
        <div className="empty">{selectedCategory ? '该分类下暂无记录' : '暂无记录'}</div>
      )}

      <div className="ts-record-list">
        {visible.map(block => {
          const diagnosis = classifyTimeBlock(block)
          const abnormal = diagnosis.range.abnormal
          const name = block.category?.trim() || '未分类'
          const color = colorForCategory(name, categories)
          const isSelected = selected.has(block.id)
          const rowClass = [
            'ts-record',
            abnormal ? 'is-abnormal' : '',
            isSelected ? 'is-selected' : '',
          ].filter(Boolean).join(' ')

          return (
            <div
              key={block.id}
              className={rowClass}
              onClick={() => (batchMode ? toggle(block.id) : onEdit(block))}
              role="button"
              tabIndex={0}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (batchMode) toggle(block.id)
                  else onEdit(block)
                }
              }}
            >
              {batchMode && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(block.id)}
                  onClick={event => event.stopPropagation()}
                  aria-label={`选择 ${block.title}`}
                />
              )}
              <span className="ts-record-dot" style={{ background: color }} />
              <div className="ts-record-main">
                <div className="ts-record-title">
                  {block.title || '未命名'}
                  {abnormal && <span className="ts-record-badge">异常</span>}
                  {block.source && SOURCE_LABEL[block.source] && (
                    <span className="ts-record-source">{SOURCE_LABEL[block.source]}</span>
                  )}
                </div>
                <div className="ts-record-meta">
                  {showDate && <span>{dayjs(block.date).format('M/D')}</span>}
                  <span>{formatRawHour(block.start)}–{formatRawHour(block.end)}</span>
                  <span className="ts-record-category">{name}</span>
                </div>
              </div>
              <span className={abnormal ? 'ts-record-hours is-abnormal' : 'ts-record-hours'}>
                {formatDuration(block.end - block.start)}
              </span>
              <div className="ts-record-buttons">
                <button
                  type="button"
                  className="btn btn-ghost ts-mini"
                  onClick={event => { event.stopPropagation(); onEdit(block) }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost ts-mini ts-danger-text"
                  onClick={event => {
                    event.stopPropagation()
                    if (confirm('确定删除这条记录？')) onDelete(block.id)
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {pageCount > 1 && (
        <div className="ts-pager">
          <button type="button" className="btn btn-outline ts-mini" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>上一页</button>
          <span>{safePage} / {pageCount}</span>
          <button type="button" className="btn btn-outline ts-mini" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>下一页</button>
        </div>
      )}
    </div>
  )
}
