import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useData } from '../../context/DataContext'
import type { ReviewEntry, ReviewPeriod } from '../../core/types'
import { readDateParam } from '../../lib/dateParam'
import { reviewRangeOf, shiftReviewKey } from '../../core/reviewKey'
import Modal from '../../core/ui/Modal'
import { REVIEW_TABS, isPeriodInProgress, resolveReviewKey } from './model/reviewPeriod'
import { emptyReviewForm, formFromReview, formToSections, isFormDirty } from './model/reviewSchema'
import type { ReviewForm } from './model/reviewSchema'
import { readStoredReviews, removeReview, upsertReview, writeStoredReviews } from './model/reviewStorage'
import { buildReviewSnapshot } from './model/reviewSnapshot'
import { useFinanceOfDay } from '../finance/useFinanceOfDay'
import { paginateReviews } from './model/reviewHistory'
import type { ReviewFilter } from './model/reviewHistory'
import ReviewEditor from './components/ReviewEditor'
import ReviewSnapshotPanel from './components/ReviewSnapshotPanel'
import ReviewHistoryList from './components/ReviewHistoryList'
import './review.css'

const parsePeriod = (value: string | null): ReviewPeriod =>
  value === 'weekly' || value === 'monthly' || value === 'yearly' ? value : 'daily'

/** 周期 key → 用于 URL 的锚点日期 */
const anchorOfKey = (period: ReviewPeriod, key: string): string => reviewRangeOf(period, key).start

export default function ReviewPage() {
  const { todos, habits, goals, timeBlocks, days } = useData()
  const [params, setParams] = useSearchParams()

  const today = dayjs().format('YYYY-MM-DD')
  const period = parsePeriod(params.get('view'))
  const anchor = readDateParam(params.get('date')) || today
  const key = resolveReviewKey(period, anchor, today)
  const currentId = `${period}:${key}`

  const [reviews, setReviews] = useState<ReviewEntry[]>(() => readStoredReviews())
  const [form, setForm] = useState<ReviewForm>(() => formFromReview(reviews.find(review => review.id === currentId)))
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<ReviewEntry | null>(null)
  const [toast, setToast] = useState('')

  const drafts = useRef(new Map<string, ReviewForm>())
  const reviewsRef = useRef(reviews)
  reviewsRef.current = reviews

  const saved = reviews.find(review => review.id === currentId) ?? null
  const dirty = isFormDirty(period, form, saved)

  // 周期切换：先按当前周期载入对应草稿或已保存内容
  useEffect(() => {
    const entry = reviewsRef.current.find(review => review.id === currentId) ?? null
    setForm(drafts.current.get(currentId) ?? formFromReview(entry))
  }, [currentId])

  // 记账摘要经 finance 层只读 hook 取得，复盘模块不再直接接触记账实体
  const finance = useFinanceOfDay(key)

  const snapshot = useMemo(
    () => buildReviewSnapshot({ period, key, todos, habits, days, finance, timeBlocks, goals }),
    [period, key, todos, habits, days, finance, timeBlocks, goals],
  )

  const history = useMemo(() => paginateReviews(reviews, filter, page), [reviews, filter, page])

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  const stashDraft = () => {
    drafts.current.set(currentId, form)
  }

  const updateQuery = (view: ReviewPeriod, date: string) => {
    const next = new URLSearchParams(params)
    next.set('view', view)
    next.set('date', date)
    setParams(next, { replace: true })
  }

  const changePeriod = (next: ReviewPeriod) => {
    stashDraft()
    updateQuery(next, anchor)
  }

  const go = (delta: number) => {
    stashDraft()
    const nextKey = shiftReviewKey(period, key, delta)
    updateQuery(period, anchorOfKey(period, nextKey))
  }

  const goToday = () => {
    stashDraft()
    updateQuery(period, today)
  }

  const pickDate = (value: string) => {
    if (!value) return
    stashDraft()
    updateQuery(period, value)
  }

  const handleSave = () => {
    const now = dayjs().toISOString()
    const entry: ReviewEntry = {
      id: currentId,
      period_type: period,
      period_key: key,
      mood: period === 'daily' ? form.mood : undefined,
      // 合并旧 sections：模板外的历史字段（如 daily.summary）在编辑保存时不丢
      sections: { ...(saved?.sections ?? {}), ...formToSections(period, form) },
      created_at: saved?.created_at || now,
      updated_at: now,
    }
    const next = upsertReview(reviews, entry)
    setReviews(next)
    writeStoredReviews(next)
    drafts.current.delete(currentId)
    flash('复盘已保存')
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const next = removeReview(reviews, pendingDelete.id)
    setReviews(next)
    writeStoredReviews(next)
    drafts.current.delete(pendingDelete.id)
    if (pendingDelete.id === currentId) setForm(emptyReviewForm())
    setPendingDelete(null)
    flash('复盘已删除')
  }

  const openReview = (review: ReviewEntry) => {
    stashDraft()
    updateQuery(review.period_type, anchorOfKey(review.period_type, review.period_key))
  }

  const dateControl = period === 'monthly' ? (
    <input
      type="month"
      className="input rv-date-input"
      value={key}
      onChange={event => pickDate(`${event.target.value}-01`)}
      aria-label="选择月份"
    />
  ) : period === 'yearly' ? (
    <select
      className="select rv-date-input"
      value={key}
      onChange={event => pickDate(`${event.target.value}-01-01`)}
      aria-label="选择年份"
    >
      {Array.from({ length: 21 }, (_, index) => Number(key) - 10 + index).map(year => (
        <option key={year} value={String(year)}>{year} 年</option>
      ))}
    </select>
  ) : (
    <input
      type="date"
      className="input rv-date-input"
      value={anchor}
      onChange={event => pickDate(event.target.value)}
      aria-label={period === 'weekly' ? '选择周内任意一天' : '选择日期'}
    />
  )

  return (
    <div className="card review-page">
      <div className="rv-toolbar">
        <div className="rv-segment" role="tablist" aria-label="复盘周期">
          {REVIEW_TABS.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={period === item.id}
              className={period === item.id ? 'is-active' : ''}
              onClick={() => changePeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="rv-period-nav">
          <button type="button" className="btn btn-outline rv-mini" onClick={() => go(-1)} aria-label="上一周期">‹</button>
          {dateControl}
          <button type="button" className="btn btn-outline rv-mini" onClick={() => go(1)} aria-label="下一周期">›</button>
          <button type="button" className="btn btn-outline rv-mini" onClick={goToday}>今天</button>
        </div>
      </div>

      <div className="rv-head">
        <h2 className="rv-title">{snapshot.label}</h2>
        <span className="rv-muted">
          {saved ? `上次保存 ${(saved.updated_at || saved.created_at).slice(0, 16).replace('T', ' ')}` : '尚未保存'}
          {dirty && saved ? ' · 有草稿' : ''}
        </span>
      </div>

      {isPeriodInProgress(period, key, today) && (
        <div className="rv-banner">本周期尚未结束，快照会随数据实时变化；可以先写草稿，结束后再补充。</div>
      )}

      <div className="rv-layout">
        <ReviewEditor
          period={period}
          form={form}
          dirty={dirty}
          hasSaved={!!saved}
          onChange={setForm}
          onSave={handleSave}
          onDelete={() => saved && setPendingDelete(saved)}
        />
        <ReviewSnapshotPanel snapshot={snapshot} />
      </div>

      <ReviewHistoryList
        history={history}
        filter={filter}
        onFilter={next => { setFilter(next); setPage(1) }}
        onPage={setPage}
        onOpen={openReview}
        onDelete={setPendingDelete}
      />

      <Modal
        open={!!pendingDelete}
        title="删除复盘"
        onClose={() => setPendingDelete(null)}
        actions={(
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPendingDelete(null)}>取消</button>
            <button type="button" className="btn btn-primary" onClick={confirmDelete}>确认删除</button>
          </>
        )}
      >
        <p>
          确定删除
          {pendingDelete ? ` ${pendingDelete.period_key} 的${pendingDelete.period_type === 'daily' ? '日' : pendingDelete.period_type === 'weekly' ? '周' : pendingDelete.period_type === 'monthly' ? '月' : '年'}复盘` : ''}
          ？删除后不可恢复。
        </p>
      </Modal>

      {toast && <div className="rv-toast" role="status">{toast}</div>}
    </div>
  )
}
