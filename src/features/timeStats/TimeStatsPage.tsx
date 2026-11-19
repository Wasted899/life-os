import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import { useData } from '../../context/DataContext'
import type { TimeBlock } from '../../core/types'
import { buildStatsIndex, collectBlocks, summarize } from './model/statsIndex'
import { aggregateCategories } from './model/categoryAgg'
import {
  GRANULARITIES,
  GRANULARITY_LABEL,
  normalizeAnchor,
  periodRangeOf,
  shiftAnchor,
} from './model/statsRange'
import type { Granularity } from './model/statsRange'
import CategoryDonut from './components/CategoryDonut'
import CategoryLegend from './components/CategoryLegend'
import DayClockWheel from './components/DayClockWheel'
import RecordsList from './components/RecordsList'
import RecordFormModal from './components/RecordFormModal'
import type { RecordFormValues } from './components/RecordFormModal'
import AbnormalDrawer from './components/AbnormalDrawer'
import CategoryManagerModal from './components/CategoryManagerModal'
import './timeStats.css'

const parseGranularity = (value: string | null): Granularity =>
  value === 'week' || value === 'month' || value === 'year' ? value : 'day'

interface FormState {
  mode: 'create' | 'edit'
  block: TimeBlock | null
}

export default function TimeStats() {
  const {
    timeBlocks,
    categories,
    addTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useData()

  const [params, setParams] = useSearchParams()
  const granularity = parseGranularity(params.get('view'))
  const anchor = normalizeAnchor(granularity, params.get('date'))
  const range = periodRangeOf(granularity, anchor)

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [formState, setFormState] = useState<FormState | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerDate, setDrawerDate] = useState<string | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [toast, setToast] = useState('')

  // 日历异常块跳转：/time?date=...&abnormal=1 打开抽屉后清理参数，避免反复触发
  useEffect(() => {
    if (params.get('abnormal') !== '1') return
    setDrawerDate(params.get('date'))
    setDrawerOpen(true)
    const next = new URLSearchParams(params)
    next.delete('abnormal')
    setParams(next, { replace: true })
  }, [params, setParams])

  const index = useMemo(() => buildStatsIndex(timeBlocks), [timeBlocks])
  const summary = useMemo(() => summarize(index, granularity, anchor), [index, granularity, anchor])
  const periodBlocks = useMemo(() => collectBlocks(index, granularity, anchor), [index, granularity, anchor])
  const aggregated = useMemo(() => aggregateCategories(summary.categories), [summary])

  const displayBlocks = useMemo(() => {
    if (!selectedCategory) return periodBlocks
    return periodBlocks.filter(block => (block.category?.trim() || '未分类') === selectedCategory)
  }, [periodBlocks, selectedCategory])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const block of timeBlocks) {
      const name = block.category?.trim() || '未分类'
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return counts
  }, [timeBlocks])

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  const updateQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const changeGranularity = (next: Granularity) => {
    setSelectedCategory(null)
    updateQuery({ view: next, date: normalizeAnchor(next, anchor) })
  }

  const go = (delta: number) => {
    updateQuery({ view: granularity, date: shiftAnchor(granularity, anchor, delta) })
  }

  const goToday = () => {
    updateQuery({ view: granularity, date: normalizeAnchor(granularity, dayjs().format('YYYY-MM-DD')) })
  }

  const pickDate = (value: string) => {
    if (!value) return
    updateQuery({ view: granularity, date: normalizeAnchor(granularity, value) })
  }

  const openCreate = () => setFormState({ mode: 'create', block: null })
  const openEdit = (block: TimeBlock) => setFormState({ mode: 'edit', block })

  const handleSave = (values: RecordFormValues) => {
    if (formState?.mode === 'edit' && formState.block) {
      updateTimeBlock(formState.block.id, values)
      flash('记录已更新')
    } else {
      addTimeBlock({ ...values, source: 'manual' })
      flash('记录已添加')
    }
    setFormState(null)
  }

  const handleDelete = (id: string) => {
    deleteTimeBlock(id)
    flash('记录已删除')
  }

  const handleBatchDelete = (ids: string[]) => {
    ids.forEach(id => deleteTimeBlock(id))
    flash(`已删除 ${ids.length} 条记录`)
  }

  const handleAddCategory = (name: string, color: string): string | null => {
    const trimmed = name.trim()
    if (!trimmed) return '分类名不能为空'
    if (trimmed === '其他') return '「其他」是保留分类，不能新建'
    if (categories.some(item => item.name === trimmed)) return '分类名已存在'
    addCategory({ name: trimmed, color })
    flash(`已新增分类「${trimmed}」`)
    return null
  }

  const handleRenameCategory = (id: string, name: string): string | null => {
    const target = categories.find(item => item.id === id)
    if (!target) return '分类不存在'
    const trimmed = name.trim()
    if (!trimmed) return '分类名不能为空'
    if (trimmed === target.name) return null
    if (target.name === '其他') return '「其他」是保留分类，不能重命名'
    if (trimmed === '其他') return '「其他」是保留分类，不能重命名'
    if (categories.some(item => item.name === trimmed)) return '分类名已存在'

    const affected = timeBlocks.filter(block => (block.category ?? '') === target.name)
    updateCategory(id, { name: trimmed })
    affected.forEach(block => updateTimeBlock(block.id, { category: trimmed }))
    flash(affected.length > 0 ? `已重命名并迁移 ${affected.length} 条记录` : '分类已重命名')
    return null
  }

  const handleDeleteCategory = (id: string): string | null => {
    const target = categories.find(item => item.id === id)
    if (!target) return '分类不存在'
    if (target.name === '其他') return '「其他」是保留分类，不能删除'

    const affected = timeBlocks.filter(block => (block.category ?? '') === target.name)
    affected.forEach(block => updateTimeBlock(block.id, { category: '其他' }))
    deleteCategory(id)
    flash(affected.length > 0 ? `已删除分类，${affected.length} 条记录归入「其他」` : '分类已删除')
    return null
  }

  const handleCategoryColor = (id: string, color: string) => {
    updateCategory(id, { color })
  }

  const dateControl = granularity === 'month' ? (
    <input
      type="month"
      className="input ts-date-input"
      value={anchor.slice(0, 7)}
      onChange={event => pickDate(event.target.value)}
      aria-label="选择月份"
    />
  ) : granularity === 'year' ? (
    <select
      className="select ts-date-input"
      value={anchor.slice(0, 4)}
      onChange={event => pickDate(event.target.value)}
      aria-label="选择年份"
    >
      {Array.from({ length: 21 }, (_, index) => Number(anchor.slice(0, 4)) - 10 + index).map(year => (
        <option key={year} value={String(year)}>{year} 年</option>
      ))}
    </select>
  ) : (
    <input
      type="date"
      className="input ts-date-input"
      value={anchor}
      onChange={event => pickDate(event.target.value)}
      aria-label={granularity === 'week' ? '选择周内任意一天' : '选择日期'}
    />
  )

  return (
    <div className="card time-stats-page">
      <div className="ts-toolbar">
        <div className="ts-segment" role="tablist" aria-label="统计粒度">
          {GRANULARITIES.map(item => (
            <button
              key={item}
              type="button"
              className={granularity === item ? 'is-active' : ''}
              onClick={() => changeGranularity(item)}
              role="tab"
              aria-selected={granularity === item}
            >
              {GRANULARITY_LABEL[item]}
            </button>
          ))}
        </div>

        <div className="ts-period-nav">
          <button type="button" className="btn btn-outline ts-mini" onClick={() => go(-1)} aria-label="上一周期">‹</button>
          {dateControl}
          <button type="button" className="btn btn-outline ts-mini" onClick={() => go(1)} aria-label="下一周期">›</button>
          <button type="button" className="btn btn-outline ts-mini" onClick={goToday}>今天</button>
        </div>

        <div className="ts-actions">
          <button
            type="button"
            className={index.abnormal.length > 0 ? 'btn btn-outline ts-health is-dirty' : 'btn btn-outline ts-health'}
            onClick={() => { setDrawerDate(null); setDrawerOpen(true) }}
          >
            数据体检{index.abnormal.length > 0 ? ` · ${index.abnormal.length}` : ''}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setManagerOpen(true)}>分类管理</button>
          <button type="button" className="btn btn-primary" onClick={openCreate}>+ 添加记录</button>
        </div>
      </div>

      <div className="ts-period-label">{range.label}</div>

      {index.abnormal.length > 0 && (
        <div className="ts-banner">
          <span>有 {index.abnormal.length} 条异常时间记录未计入统计，明细中已标红。</span>
          <button type="button" className="btn btn-ghost ts-mini" onClick={() => { setDrawerDate(null); setDrawerOpen(true) }}>去处理</button>
        </div>
      )}

      <div className="ts-summary">
        <div className="ts-stat"><span>总时长</span><strong>{summary.totalHours.toFixed(1)}h</strong></div>
        <div className="ts-stat"><span>记录数</span><strong>{summary.count}</strong></div>
        <div className="ts-stat"><span>分类数</span><strong>{summary.categories.length}</strong></div>
      </div>

      <div className="ts-layout">
        <section className="ts-chart">
          <CategoryDonut
            items={aggregated}
            totalHours={summary.totalHours}
            recordCount={summary.count}
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            granularityLabel={`${GRANULARITY_LABEL[granularity]}视图`}
          />
          <CategoryLegend
            items={aggregated}
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
          {granularity === 'day' && (
            <DayClockWheel
              blocks={periodBlocks}
              date={anchor}
              totalHours={summary.totalHours}
              categories={categories}
            />
          )}
        </section>

        <section className="ts-detail">
          <RecordsList
            key={`${granularity}-${anchor}-${selectedCategory ?? 'all'}`}
            blocks={displayBlocks}
            categories={categories}
            showDate={granularity !== 'day'}
            selectedCategory={selectedCategory}
            onClearCategory={() => setSelectedCategory(null)}
            onEdit={openEdit}
            onDelete={handleDelete}
            onBatchDelete={handleBatchDelete}
          />
        </section>
      </div>

      {formState && (
        <RecordFormModal
          mode={formState.mode}
          initial={formState.block}
          defaultDate={anchor}
          categories={categories}
          onSave={handleSave}
          onDelete={id => { handleDelete(id); setFormState(null) }}
          onClose={() => setFormState(null)}
        />
      )}

      {managerOpen && (
        <CategoryManagerModal
          categories={categories}
          counts={categoryCounts}
          onAdd={handleAddCategory}
          onRename={handleRenameCategory}
          onColor={handleCategoryColor}
          onDelete={handleDeleteCategory}
          onClose={() => setManagerOpen(false)}
        />
      )}

      <AbnormalDrawer
        open={drawerOpen}
        hits={index.abnormal}
        overlaps={index.overlaps}
        initialDate={drawerDate}
        onClose={() => setDrawerOpen(false)}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {toast && createPortal(<div className="ts-toast">{toast}</div>, document.body)}
    </div>
  )
}
