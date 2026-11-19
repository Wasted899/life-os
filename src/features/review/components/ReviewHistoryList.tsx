import type { ReviewEntry } from '../../../core/types'
import { REVIEW_PERIOD_LABEL } from '../model/reviewPeriod'
import type { ReviewHistoryPage, ReviewFilter } from '../model/reviewHistory'
import { reviewSnippet } from '../model/reviewHistory'

export interface ReviewHistoryListProps {
  history: ReviewHistoryPage
  filter: ReviewFilter
  onFilter: (filter: ReviewFilter) => void
  onPage: (page: number) => void
  onOpen: (review: ReviewEntry) => void
  onDelete: (review: ReviewEntry) => void
}

const FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'daily', label: '日' },
  { id: 'weekly', label: '周' },
  { id: 'monthly', label: '月' },
  { id: 'yearly', label: '年' },
]

export default function ReviewHistoryList({
  history,
  filter,
  onFilter,
  onPage,
  onOpen,
  onDelete,
}: ReviewHistoryListProps) {
  return (
    <section className="rv-history">
      <div className="rv-history-head">
        <h3 className="rv-history-title">历史复盘</h3>
        <div className="rv-filters" role="tablist" aria-label="按周期筛选">
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? 'rv-chip is-active' : 'rv-chip'}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {history.items.length === 0 ? (
        <p className="rv-empty">还没有复盘记录，从上方开始写第一篇吧。</p>
      ) : (
        <ul className="rv-history-list">
          {history.items.map(review => (
            <li key={review.id} className="rv-history-item">
              <button type="button" className="rv-history-main" onClick={() => onOpen(review)}>
                <span className="rv-history-period">{REVIEW_PERIOD_LABEL[review.period_type]} · {review.period_key}</span>
                <span className="rv-history-snippet">{reviewSnippet(review)}</span>
                <span className="rv-muted">
                  {review.mood ? `${'★'.repeat(review.mood)} · ` : ''}
                  {(review.updated_at || review.created_at).slice(0, 10)}
                </span>
              </button>
              <button type="button" className="btn btn-ghost rv-history-delete" onClick={() => onDelete(review)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}

      {history.totalPages > 1 && (
        <div className="rv-pager">
          <button type="button" className="btn btn-outline rv-mini" disabled={history.page <= 1} onClick={() => onPage(history.page - 1)}>‹</button>
          <span className="rv-muted">{history.page} / {history.totalPages} · 共 {history.total} 条</span>
          <button type="button" className="btn btn-outline rv-mini" disabled={history.page >= history.totalPages} onClick={() => onPage(history.page + 1)}>›</button>
        </div>
      )}
    </section>
  )
}
