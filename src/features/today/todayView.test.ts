import { describe, it, expect } from 'vitest'
import type { Goal, Habit, ImportantDay, TimeBlock, Todo, Transaction } from '../../core/types'
import { buildTodayView, TODAY_LIMITS } from './todayView'

const TODAY = '2026-11-14' // 周六，ISO 第 46 周

const todo = (over: Partial<Todo> & { id: string }): Todo => ({
  title: over.id,
  completed: false,
  list_id: 'inbox',
  pinned: false,
  status: 'todo',
  source: 'manual',
  quadrant: 'q2',
  ...over,
})

const habit = (over: Partial<Habit> & { id: string }): Habit => ({
  title: over.id,
  frequency: 'daily',
  check_dates: [],
  ...over,
})

const goal = (over: Partial<Goal> & { id: string }): Goal => ({
  title: over.id,
  type: 'yearly',
  progress: 0,
  status: 'active',
  ...over,
})

const importantDay = (over: Partial<ImportantDay> & { id: string }): ImportantDay => ({
  title: over.id,
  date: '2026-11-20',
  category: '生活',
  pinned: false,
  type: 'countdown',
  ...over,
})

const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  date: TODAY,
  type: 'expense',
  category: '餐饮',
  amount: 0,
  account: '现金',
  ...over,
})

const block = (over: Partial<TimeBlock> & { id: string }): TimeBlock => ({
  date: TODAY,
  start: 9,
  end: 10,
  title: over.id,
  category: '学习',
  ...over,
})

const empty = {
  todos: [] as Todo[],
  habits: [] as Habit[],
  days: [] as ImportantDay[],
  transactions: [] as Transaction[],
  timeBlocks: [] as TimeBlock[],
  goals: [] as Goal[],
}

describe('buildTodayView · 今日待办', () => {
  const todos = [
    todo({ id: 'overdue', due_date: '2026-11-12', due_time: '10:00' }),
    todo({ id: 'today-late', due_date: TODAY, due_time: '18:00' }),
    todo({ id: 'today-early', due_date: TODAY, due_time: '09:00' }),
    todo({ id: 'today-none', due_date: TODAY }),
    todo({ id: 't1', due_date: TODAY, due_time: '12:00' }),
    todo({ id: 't2', due_date: TODAY, due_time: '13:00' }),
    todo({ id: 't3', due_date: TODAY, due_time: '14:00' }),
    todo({ id: 'someday' }),
    todo({ id: 'future', due_date: '2026-11-20' }),
    todo({ id: 'done-today', due_date: TODAY, completed: true }),
  ]

  it('逾期置顶、按时间排序、无日期与已完成不进入、超过 6 条截断', () => {
    const snapshot = JSON.stringify(todos)
    const view = buildTodayView({ ...empty, todos, today: TODAY })
    const ids = view.todos.map(item => item.todo.id)

    expect(ids[0]).toBe('overdue')
    expect(view.todos[0].overdue).toBe(true)
    expect(ids.slice(1)).toEqual(['today-early', 't1', 't2', 't3', 'today-late'])
    expect(ids).not.toContain('someday')
    expect(ids).not.toContain('future')
    expect(ids).not.toContain('done-today')

    expect(view.todos).toHaveLength(TODAY_LIMITS.todos)
    expect(view.todoPending).toBe(7)
    expect(view.todoRemaining).toBe(1)
    expect(view.overdueCount).toBe(1)
    expect(view.todoDoneToday).toBe(1)
    // 纯读：输入数组未被修改
    expect(JSON.stringify(todos)).toBe(snapshot)
  })

  it('置顶任务排在非置顶之前', () => {
    const view = buildTodayView({
      ...empty,
      todos: [
        todo({ id: 'normal', due_date: TODAY, due_time: '08:00' }),
        todo({ id: 'pinned', due_date: TODAY, due_time: '20:00', pinned: true }),
      ],
      today: TODAY,
    })
    expect(view.todos.map(item => item.todo.id)).toEqual(['pinned', 'normal'])
  })
})

describe('buildTodayView · 今日习惯', () => {
  const habits = [
    habit({ id: 'daily-unchecked' }),
    habit({ id: 'daily-checked', check_dates: [TODAY] }),
    habit({ id: 'monthly-checked', frequency: 'monthly_day', monthly_day: 20, check_dates: [TODAY] }),
    habit({ id: 'weekday-skip', frequency: 'weekdays' }),
  ]

  it('只显示今天该做 + 今天已打卡，未打卡排在前', () => {
    const view = buildTodayView({ ...empty, habits, today: TODAY })
    const ids = view.habits.map(item => item.habit.id)

    expect(ids).toEqual(['daily-unchecked', 'daily-checked', 'monthly-checked'])
    expect(ids).not.toContain('weekday-skip')
    expect(view.habitDueTotal).toBe(2)
    expect(view.habitDueDone).toBe(1)
    expect(view.habitRemaining).toBe(0)
    expect(view.habits[1].checked).toBe(true)
    expect(view.habits[1].progress.done).toBe(1)
    // 今天不该做但已打卡：显示且标记已打卡
    expect(view.habits[2].checked).toBe(true)
  })
})

describe('buildTodayView · 目标摘要', () => {
  it('按 日→周→月→年 取第一个非空层级，进度用子目标等权汇总', () => {
    const goals = [
      goal({ id: 'y', title: '年度', level: 'year', period_key: '2026' }),
      goal({ id: 'm', title: '十一月', level: 'month', period_key: '2026-11', parent_id: 'y', progress: 10 }),
      goal({ id: 'w45', title: '上周', level: 'week', period_key: '2026-W45', parent_id: 'm', progress: 100 }),
      goal({ id: 'w44', title: '上上周', level: 'week', period_key: '2026-W44', parent_id: 'm', progress: 50 }),
      goal({ id: 'm2', title: '备用月目标', level: 'month', period_key: '2026-11', progress: 40 }),
    ]
    const view = buildTodayView({ ...empty, goals, today: TODAY })

    expect(view.goalLevel).toBe('month')
    expect(view.goals.map(item => item.goal.id).sort()).toEqual(['m', 'm2'])
    const month = view.goals.find(item => item.goal.id === 'm')!
    // 100 / 50 等权平均 = 75，忽略自身 progress=10
    expect(month.percent).toBe(75)
    expect(view.goals.find(item => item.goal.id === 'm2')!.percent).toBe(40)
    expect(view.goalRemaining).toBe(0)
  })

  it('当前周期没有目标时继续向上一层找；完成态不进入', () => {
    const view = buildTodayView({
      ...empty,
      goals: [
        goal({ id: 'y', level: 'year', period_key: '2026' }),
        goal({ id: 'm-old', level: 'month', period_key: '2026-10' }),
        goal({ id: 'm-done', level: 'month', period_key: '2026-11', status: 'completed' }),
      ],
      today: TODAY,
    })
    expect(view.goalLevel).toBe('year')
    expect(view.goals.map(item => item.goal.id)).toEqual(['y'])
  })

  it('最多 3 条并给出剩余数量', () => {
    const goals = Array.from({ length: 5 }, (_, index) =>
      goal({ id: `m${index}`, level: 'month', period_key: '2026-11' }),
    )
    const view = buildTodayView({ ...empty, goals, today: TODAY })
    expect(view.goals).toHaveLength(TODAY_LIMITS.goals)
    expect(view.goalRemaining).toBe(2)
  })
})

describe('buildTodayView · 重要日子', () => {
  it('只取未来的倒计时，按临近排序并截断 3 条', () => {
    const days = [
      importantDay({ id: 'd20', date: '2026-11-20' }),
      importantDay({ id: 'd01', date: '2026-12-01' }),
      importantDay({ id: 'd16', date: '2026-11-16' }),
      importantDay({ id: 'd30', date: '2026-11-30' }),
      importantDay({ id: 'past', date: '2026-11-01' }),
      importantDay({ id: 'countup', date: '2026-11-10', type: 'countup' }),
    ]
    const view = buildTodayView({ ...empty, days, today: TODAY })
    expect(view.days.map(item => item.day.id)).toEqual(['d16', 'd20', 'd30'])
    expect(view.days[0].daysLeft).toBe(2)
    expect(view.daysRemaining).toBe(1)
  })
})

describe('buildTodayView · 记账摘要', () => {
  it('只统计今天：支出合计、笔数、最大分类，收入单独小计', () => {
    const transactions = [
      tx({ id: 'a', category: '餐饮', amount: 30 }),
      tx({ id: 'b', category: '交通', amount: 50 }),
      tx({ id: 'c', type: 'income', category: '工资', amount: 100 }),
      tx({ id: 'other-day', date: '2026-11-13', category: '购物', amount: 999 }),
    ]
    const view = buildTodayView({ ...empty, transactions, today: TODAY })
    expect(view.finance.expense).toBe(80)
    expect(view.finance.income).toBe(100)
    expect(view.finance.count).toBe(2)
    expect(view.finance.topCategory).toBe('交通')
    expect(view.finance.topCategoryAmount).toBe(50)
  })
})

describe('buildTodayView · 专注时长与空态', () => {
  it('今日时间块合计，忽略负时长与其他日期', () => {
    const view = buildTodayView({
      ...empty,
      timeBlocks: [
        block({ id: 'b1', start: 9, end: 11 }),
        block({ id: 'b2', start: 14, end: 15.5 }),
        block({ id: 'bad', start: 16, end: 15 }),
        block({ id: 'other', date: '2026-11-13', start: 9, end: 12 }),
      ],
      today: TODAY,
    })
    expect(view.focusHours).toBe(3.5)
  })

  it('全部空数组时给出空态数值', () => {
    const view = buildTodayView({ ...empty, today: TODAY })
    expect(view.todos).toEqual([])
    expect(view.habits).toEqual([])
    expect(view.days).toEqual([])
    expect(view.goals).toEqual([])
    expect(view.goalLevel).toBeNull()
    expect(view.todoPending).toBe(0)
    expect(view.todoDoneToday).toBe(0)
    expect(view.overdueCount).toBe(0)
    expect(view.habitDueTotal).toBe(0)
    expect(view.habitDueDone).toBe(0)
    expect(view.focusHours).toBe(0)
    expect(view.finance).toEqual({ expense: 0, income: 0, count: 0, topCategory: '', topCategoryAmount: 0 })
  })

  it('换一天结果随之切换', () => {
    const input = {
      ...empty,
      todos: [todo({ id: 'tomorrow', due_date: '2026-11-15' })],
      days: [importantDay({ id: 'd16', date: '2026-11-16' })],
    }
    const on14 = buildTodayView({ ...input, today: TODAY })
    expect(on14.todos).toEqual([])
    expect(on14.days[0].daysLeft).toBe(2)

    const on15 = buildTodayView({ ...input, today: '2026-11-15' })
    expect(on15.todos.map(item => item.todo.id)).toEqual(['tomorrow'])
    expect(on15.days[0].daysLeft).toBe(1)
  })
})
