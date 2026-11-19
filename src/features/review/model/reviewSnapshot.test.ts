import { describe, expect, it } from 'vitest'
import source from './reviewSnapshot.ts?raw'
import type { Goal, Habit, ImportantDay, TimeBlock, Todo } from '../../../core/types'
import { buildTodayView } from '../../today/todayView'
import { buildReviewSnapshot } from './reviewSnapshot'

const TODAY = '2026-11-19'
const WEEK_START = '2026-11-16'

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

const block = (over: Partial<TimeBlock> & { id: string }): TimeBlock => ({
  date: TODAY,
  start: 9,
  end: 10,
  title: over.id,
  category: '学习',
  ...over,
})

const fixture = {
  todos: [
    todo({ id: 'done-today', due_date: TODAY, completed: true }),
    todo({ id: 'done-week', due_date: '2026-11-17', completed: true }),
    todo({ id: 'pending-today', due_date: TODAY }),
    todo({ id: 'overdue', due_date: '2026-11-10' }),
    todo({ id: 'no-date', completed: true }),
    todo({ id: 'next-week', due_date: '2026-11-24' }),
  ],
  habits: [
    habit({ id: 'run', check_dates: ['2026-11-19', '2026-11-18'] }),
    habit({ id: 'read', check_dates: ['2026-11-17'] }),
  ],
  days: [] as ImportantDay[],
  finance: { expense: 32.5, income: 100, count: 1, topCategory: '餐饮', topCategoryAmount: 32.5 },
  timeBlocks: [
    block({ id: 'b1', start: 9, end: 11, category: '学习' }),
    block({ id: 'b2', date: '2026-11-18', start: 14, end: 16, category: '工作' }),
    block({ id: 'out', date: '2026-10-01', start: 9, end: 10 }),
    block({ id: 'bad', date: TODAY, start: 22, end: 30, category: '学习' }),
  ],
  goals: [
    goal({ id: 'g-day', title: '日目标', type: 'daily', level: 'day', period_key: TODAY, progress: 40 }),
    goal({ id: 'g-week', title: '周目标', type: 'weekly', level: 'week', period_key: '2026-W47', progress: 60 }),
    goal({ id: 'g-month', title: '月目标', type: 'monthly', level: 'month', period_key: '2026-11', progress: 70 }),
    goal({ id: 'g-year', title: '年目标', type: 'yearly', level: 'year', period_key: '2026', progress: 80 }),
  ],
}

const inputOf = (period: 'daily' | 'weekly' | 'monthly' | 'yearly', key: string) => ({
  period,
  key,
  ...fixture,
})

describe('reviewSnapshot · 日快照与首页同口径', () => {
  const view = buildTodayView({ ...fixture, today: TODAY })
  const snapshot = buildReviewSnapshot(inputOf('daily', TODAY))

  it('待办完成数一致', () => {
    expect(snapshot.todos.done).toBe(view.todoDoneToday)
    expect(snapshot.todos.pending).toBe(view.todoPending)
  })

  it('习惯应做/已做一致', () => {
    expect(snapshot.habits.due).toBe(view.habitDueTotal)
    expect(snapshot.habits.done).toBe(view.habitDueDone)
  })

  it('专注时长与财务摘要一致', () => {
    expect(snapshot.focus.hours).toBe(view.focusHours)
    expect(snapshot.finance).toMatchObject({ expense: view.finance.expense, income: view.finance.income })
  })

  it('异常块不计入分类统计，但记录条数', () => {
    expect(snapshot.focus.excluded).toBe(1)
    expect(snapshot.focus.categories.reduce((sum, item) => sum + item.hours, 0)).toBe(2)
  })
})

describe('reviewSnapshot · 周/月/年', () => {
  it('周快照按周一到周日聚合，排除异常块', () => {
    const snapshot = buildReviewSnapshot(inputOf('weekly', '2026-W47'))
    expect(snapshot.range).toEqual({ start: WEEK_START, end: '2026-11-22' })
    expect(snapshot.todos).toMatchObject({ total: 3, done: 2, pending: 1 })
    expect(snapshot.focus.hours).toBe(4)
    expect(snapshot.focus.excluded).toBe(1)
    expect(snapshot.goals.items.map(item => item.id)).toEqual(['g-week'])
  })

  it('月/年快照取对应层级目标', () => {
    expect(buildReviewSnapshot(inputOf('monthly', '2026-11')).goals.items.map(item => item.id)).toEqual(['g-month'])
    expect(buildReviewSnapshot(inputOf('yearly', '2026')).goals.items.map(item => item.id)).toEqual(['g-year'])
  })

  it('周快照习惯按天累计应做与已做', () => {
    const snapshot = buildReviewSnapshot(inputOf('weekly', '2026-W47'))
    // 两个 daily 习惯 * 7 天
    expect(snapshot.habits.due).toBe(14)
    expect(snapshot.habits.done).toBe(3)
  })

  it('快照不修改入参', () => {
    const before = JSON.stringify(fixture)
    buildReviewSnapshot(inputOf('yearly', '2026'))
    expect(JSON.stringify(fixture)).toBe(before)
  })
})

describe('reviewSnapshot · 架构守卫', () => {
  it('不 import React / Context / storage / 写入口', () => {
    expect(source).not.toMatch(/from ['"][^'"]*context\//)
    expect(source).not.toMatch(/from ['"]react['"]/)
    expect(source).not.toMatch(/core\/storage/)
    expect(source).not.toMatch(/\b(add|update|delete|save|write)[A-Z]\w*\s*\(/)
    expect(source).not.toMatch(/\b(save|writeLegacy|writeStoredReviews)\s*\(/)
  })
})
