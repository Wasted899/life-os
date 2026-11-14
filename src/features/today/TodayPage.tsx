import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useData } from '../../context/DataContext'
import type { GoalLevel, Habit, Todo } from '../../core/types'
import CompleteTimeModal from '../todos/components/CompleteTimeModal'
import { useHabitCheckin } from '../habits/useHabitCheckin'
import { buildTodayView } from './todayView'

const LEVEL_LABELS: Record<GoalLevel, string> = {
  year: '年度',
  month: '月度',
  week: '周',
  day: '日',
}

const EMPTY_TEXT: Record<string, string> = {
  todos: '今天没有排期的待办',
  habits: '今天没有需要打卡的习惯',
  days: '暂无即将到来的日子',
  goals: '当前周期还没有目标',
}

const Bar = ({ percent }: { percent: number }) => (
  <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', flex: 1 }}>
    <div
      style={{
        width: `${Math.min(100, Math.max(0, percent))}%`,
        height: '100%',
        background: percent >= 100 ? '#22c55e' : 'var(--primary)',
        transition: 'width .3s',
      }}
    />
  </div>
)

const Kpi = ({ label, value, sub, tone, onClick }: {
  label: string
  value: string
  sub: string
  tone?: 'amber'
  onClick?: () => void
}) => (
  <div
    onClick={onClick}
    style={{
      padding: '14px 16px',
      borderRadius: 12,
      border: tone === 'amber' ? '1px dashed #fcd34d' : '1px solid #e2e8f0',
      background: tone === 'amber' ? '#fffbeb' : 'linear-gradient(135deg,#eff6ff,#dbeafe)',
      cursor: onClick ? 'pointer' : 'default',
    }}
  >
    <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: tone === 'amber' ? '#b45309' : '#1e3a8a', lineHeight: 1.2, marginTop: 2 }}>
      {value}
    </div>
    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
  </div>
)

const CardHead = ({ title, extra }: { title: string; extra?: ReactNode }) => (
  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span>{title}</span>
    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400 }}>{extra}</span>
  </div>
)

export default function Today() {
  const {
    todos, habits, days, transactions, timeBlocks, goals, categories,
    updateTodo, updateHabit, addTimeBlock,
  } = useData()
  const navigate = useNavigate()
  const today = dayjs().format('YYYY-MM-DD')

  const view = useMemo(
    () => buildTodayView({ todos, habits, days, transactions, timeBlocks, goals, today }),
    [todos, habits, days, transactions, timeBlocks, goals, today],
  )

  const { pendingCheck, check, finishCheck, cancelCheck } = useHabitCheckin()
  const [pendingTime, setPendingTime] = useState<Todo | null>(null)

  /** 与待办页完成逻辑一致：可选记用时；非今日的习惯待办补写对应日期的 check_dates */
  const applyComplete = (todo: Todo, minutes: number | null) => {
    const statDate = todo.due_date || today
    if (!todo.completed && minutes !== null) {
      const category = categories.find(item => item.id === todo.category_id)
      const parts = todo.due_time ? todo.due_time.split(':').map(Number) : []
      const startHour = parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])
        ? parts[0] + parts[1] / 60
        : dayjs().hour()
      addTimeBlock({
        date: statDate,
        start: startHour,
        end: startHour + minutes / 60,
        title: todo.title,
        category: category?.name || '学习',
        source: 'todo',
      })
    }
    updateTodo(todo.id, { completed: !todo.completed })
    // 今日的习惯待办由 DataContext.updateTodo 统一处理，这里只补逾期日期，避免重复写入
    if (todo.source === 'habit' && todo.habit_id && statDate !== today) {
      const habit = habits.find(item => item.id === todo.habit_id)
      if (habit) {
        const checked = habit.check_dates.includes(statDate)
        if (!todo.completed && !checked) updateHabit(habit.id, { check_dates: [...habit.check_dates, statDate] })
        if (todo.completed && checked) updateHabit(habit.id, { check_dates: habit.check_dates.filter(date => date !== statDate) })
      }
    }
  }

  const toggleTodo = (todo: Todo) => {
    if (!todo.completed) {
      setPendingTime(todo)
      return
    }
    applyComplete(todo, null)
  }

  const confirmTodoTime = (minutes: number | null) => {
    const todo = pendingTime
    setPendingTime(null)
    if (todo) applyComplete(todo, minutes)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 第一行：4 个 KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        <Kpi
          label="今日待办"
          value={String(view.todoPending)}
          sub={view.overdueCount > 0
            ? `今日完成 ${view.todoDoneToday} · 逾期 ${view.overdueCount}`
            : `今日完成 ${view.todoDoneToday}`}
        />
        <Kpi label="今日习惯" value={`${view.habitDueDone}/${view.habitDueTotal}`} sub="今天该做" />
        <Kpi label="今日专注" value={`${view.focusHours.toFixed(1)}h`} sub="时间块合计" />
        <Kpi
          label="今日支出"
          value={`¥${view.finance.expense.toFixed(2)}`}
          sub={`${view.finance.count} 笔 · 记账只读`}
          tone="amber"
          onClick={() => navigate('/finance')}
        />
      </div>

      {/* 第二行：待办 + 习惯 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 12 }}>
        <div className="card">
          <CardHead title="今日待办" extra={<Link to="/todos">全部待办 →</Link>} />
          {view.todos.length === 0 ? (
            <div className="empty" style={{ padding: '18px 0' }}>
              {EMPTY_TEXT.todos} <Link to="/todos">去安排 →</Link>
            </div>
          ) : (
            view.todos.map(({ todo, overdue }) => (
              <div
                key={todo.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 0', borderTop: '1px solid #f1f5f9',
                }}
              >
                <button
                  className="btn btn-ghost"
                  style={{ padding: 0, width: 22, height: 22, display: 'grid', placeItems: 'center' }}
                  title="标记完成"
                  onClick={() => toggleTodo(todo)}
                >
                  <span style={{ width: 15, height: 15, border: '1.5px solid #94a3b8', borderRadius: 4, display: 'block' }} />
                </button>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {todo.title}
                </span>
                {overdue && (
                  <span className="tag" style={{ background: '#fee2e2', color: '#b91c1c' }}>逾期</span>
                )}
                {todo.due_time && <span style={{ fontSize: 12, color: '#64748b' }}>{todo.due_time}</span>}
              </div>
            ))
          )}
          {view.todoRemaining > 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}>还有 {view.todoRemaining} 条</div>
          )}
        </div>

        <div className="card">
          <CardHead title="今日习惯" extra={<Link to="/habits">全部习惯 →</Link>} />
          {view.habits.length === 0 ? (
            <div className="empty" style={{ padding: '18px 0' }}>{EMPTY_TEXT.habits}</div>
          ) : (
            view.habits.map(({ habit, checked, progress }) => (
              <div
                key={habit.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid #f1f5f9' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{habit.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Bar percent={progress.total ? (progress.done / progress.total) * 100 : 0} />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{progress.done}/{progress.total}</span>
                  </div>
                </div>
                <button
                  className={`btn ${checked ? 'btn-ghost' : 'btn-primary'}`}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => check(habit)}
                >
                  {checked ? '已打卡' : '打卡'}
                </button>
              </div>
            ))
          )}
          {view.habitRemaining > 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}>还有 {view.habitRemaining} 个</div>
          )}
        </div>
      </div>

      {/* 第三行：重要日子 / 目标摘要 / 记账摘要 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        <div className="card">
          <CardHead title="重要日子" extra={<Link to="/days">全部 →</Link>} />
          {view.days.length === 0 ? (
            <div className="empty" style={{ padding: '18px 0' }}>{EMPTY_TEXT.days}</div>
          ) : (
            view.days.map(({ day, daysLeft }) => (
              <div key={day.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.title}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{day.date}</span>
                <span className="tag" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                  {daysLeft === 0 ? '今天' : daysLeft === 1 ? '明天' : `${daysLeft} 天后`}
                </span>
              </div>
            ))
          )}
          {view.daysRemaining > 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}>还有 {view.daysRemaining} 个</div>
          )}
        </div>

        <div className="card">
          <CardHead
            title="目标摘要"
            extra={<Link to="/goals">全部目标 →</Link>}
          />
          {view.goals.length === 0 ? (
            <div className="empty" style={{ padding: '18px 0' }}>
              {EMPTY_TEXT.goals} <Link to="/goals">去设定 →</Link>
            </div>
          ) : (
            view.goals.map(({ goal, level, percent }) => (
              <div key={goal.id} style={{ padding: '9px 0', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="tag" style={{ background: '#f1f5f9', color: '#475569' }}>{LEVEL_LABELS[level]}</span>
                  <span style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.title}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{percent}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
                  <Bar percent={percent} />
                </div>
              </div>
            ))
          )}
          {view.goalRemaining > 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}>还有 {view.goalRemaining} 个</div>
          )}
        </div>

        <div
          onClick={() => navigate('/finance')}
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px dashed #fcd34d',
            background: '#fffbeb',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#92400e' }}>记账摘要</span>
            <span className="tag" style={{ background: '#fef3c7', color: '#92400e' }}>只读</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#b45309' }}>去记账 →</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#b45309', marginTop: 8 }}>
            ¥{view.finance.expense.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>
            今日支出 · {view.finance.count} 笔
          </div>
          <div style={{ fontSize: 13, color: '#78350f', marginTop: 10 }}>
            {view.finance.topCategory
              ? `最大分类：${view.finance.topCategory} ¥${view.finance.topCategoryAmount.toFixed(2)}`
              : '今天还没有支出记录'}
          </div>
          <div style={{ fontSize: 12, color: '#a16207', marginTop: 4 }}>
            收入 ¥{view.finance.income.toFixed(2)}
          </div>
        </div>
      </div>

      <CompleteTimeModal
        open={!!pendingTime}
        title={pendingTime?.title || ''}
        onCancel={() => setPendingTime(null)}
        onConfirm={confirmTodoTime}
      />
      <CompleteTimeModal
        open={!!pendingCheck}
        title={pendingCheck?.title || ''}
        onCancel={cancelCheck}
        onConfirm={finishCheck}
      />
    </div>
  )
}
