import type { ReviewSnapshot } from '../model/reviewSnapshot'

export interface ReviewSnapshotPanelProps {
  snapshot: ReviewSnapshot
}

const percentText = (rate: number): string => `${Math.round(rate * 100)}%`

const formatHours = (hours: number): string => `${hours.toFixed(1)}h`

export default function ReviewSnapshotPanel({ snapshot }: ReviewSnapshotPanelProps) {
  const { todos, habits, focus, goals, finance } = snapshot

  return (
    <aside className="rv-snapshot" aria-label="周期数据快照">
      <div className="rv-snapshot-title">
        <span>数据快照</span>
        <span className="rv-muted">只读 · 实时计算</span>
      </div>

      <div className="rv-metric">
        <div className="rv-metric-head">
          <span>待办</span>
          <strong>{todos.done} / {todos.total}</strong>
        </div>
        <div className="rv-bar"><i style={{ width: percentText(todos.rate) }} /></div>
        <div className="rv-muted">完成 {todos.done} 项，未完成 {todos.pending} 项</div>
      </div>

      <div className="rv-metric">
        <div className="rv-metric-head">
          <span>习惯打卡</span>
          <strong>{habits.done} / {habits.due}</strong>
        </div>
        <div className="rv-bar"><i style={{ width: percentText(habits.rate) }} /></div>
        <div className="rv-muted">
          {habits.items.length > 0 ? `共 ${habits.items.length} 个习惯` : '本周期没有应做习惯'}
          {habits.extra > 0 ? ` · 额外打卡 ${habits.extra} 次` : ''}
        </div>
        {habits.items.length > 0 && (
          <ul className="rv-mini-list">
            {habits.items.slice(0, 4).map(item => (
              <li key={item.id}>
                <span>{item.name}</span>
                <span>{item.due > 0 ? `${item.done}/${item.due}` : `额外 ${item.extra}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rv-metric">
        <div className="rv-metric-head">
          <span>专注时长</span>
          <strong>{formatHours(focus.hours)}</strong>
        </div>
        <div className="rv-muted">
          {focus.excluded > 0 ? `已排除 ${focus.excluded} 条异常记录` : '无异常时间记录'}
        </div>
        {focus.categories.length > 0 && (
          <ul className="rv-mini-list">
            {focus.categories.slice(0, 4).map(item => (
              <li key={item.category}>
                <span>{item.category}</span>
                <span>{formatHours(item.hours)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {goals.items.length > 0 && (
        <div className="rv-metric">
          <div className="rv-metric-head">
            <span>目标进度</span>
            <strong>{goals.items.length} 个</strong>
          </div>
          <ul className="rv-mini-list">
            {goals.items.slice(0, 4).map(item => (
              <li key={item.id}>
                <span className={item.completed ? 'rv-done' : ''}>{item.title}</span>
                <span>{item.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {finance && (
        <div className="rv-metric">
          <div className="rv-metric-head">
            <span>当日记账</span>
            <strong>{finance.count} 笔</strong>
          </div>
          <div className="rv-muted">支出 ¥{finance.expense.toFixed(2)} · 收入 ¥{finance.income.toFixed(2)}</div>
        </div>
      )}
    </aside>
  )
}
