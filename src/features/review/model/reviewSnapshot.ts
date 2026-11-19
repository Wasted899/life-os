import type {
  Goal,
  GoalLevel,
  Habit,
  ImportantDay,
  ReviewPeriod,
  TimeBlock,
  Todo,
} from '../../../core/types'
import { buildTodayView, type TodayFinance } from '../../today/todayView'
import { habitDue } from '../../habits/habitSchedule'
import { buildGoalIndex, goalLevelOf, goalPeriodKeyOf, periodKeyFor } from '../../goals/goalTree'
import { buildStatsIndex, summarize } from '../../timeStats/model/statsIndex'
import { datesInRange } from '../../timeStats/model/statsRange'
import { reviewLabel, reviewRangeOf } from '../../../core/reviewKey'

/**
 * 复盘只读快照（R1）。
 *
 * 纪律：
 * 1. 纯函数：不 import React / Context / storage，不调用任何写入口；
 * 2. 日快照直接复用 buildTodayView，保证与首页同口径；
 * 3. 周/月/年复用 habitDue / goalPeriodKeyOf / buildStatsIndex，不另立规则；
 * 4. 快照不落库，历史回看时按当前数据实时重算。
 */

export interface SnapshotTodo {
  total: number
  done: number
  pending: number
  /** 0~1 */
  rate: number
  items: Todo[]
}

export interface SnapshotHabitRow {
  id: string
  name: string
  due: number
  done: number
  extra: number
}

export interface SnapshotHabits {
  due: number
  done: number
  extra: number
  rate: number
  items: SnapshotHabitRow[]
}

export interface SnapshotFocus {
  hours: number
  categories: { category: string; hours: number }[]
  daily: { date: string; hours: number }[]
  /** 被排除的异常块条数（不计入 hours） */
  excluded: number
}

export interface SnapshotGoals {
  level: GoalLevel
  items: { id: string; title: string; percent: number; completed: boolean }[]
}

export interface ReviewSnapshot {
  period: ReviewPeriod
  key: string
  label: string
  range: { start: string; end: string }
  todos: SnapshotTodo
  habits: SnapshotHabits
  focus: SnapshotFocus
  goals: SnapshotGoals
  finance: { expense: number; income: number; count: number } | null
}

export interface ReviewSnapshotInput {
  period: ReviewPeriod
  key: string
  todos: Todo[]
  habits: Habit[]
  days: ImportantDay[]
  /** 当日记账摘要：复盘页面经 finance 层只读 hook 算好后传入，本模块不接触记账实体 */
  finance: TodayFinance
  timeBlocks: TimeBlock[]
  goals: Goal[]
}

const GOAL_LEVEL_OF_PERIOD: Record<ReviewPeriod, GoalLevel> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
}

const GRANULARITY_OF_PERIOD: Record<ReviewPeriod, 'day' | 'week' | 'month' | 'year'> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
}

const rateOf = (done: number, total: number): number => (total > 0 ? done / total : 0)

const goalItemsOf = (goals: Goal[], level: GoalLevel, anchorDate: string, expectedKey: string): SnapshotGoals => {
  const index = buildGoalIndex(goals)
  const items = goals
    .filter(goal => goalLevelOf(goal) === level && goalPeriodKeyOf(goal, anchorDate) === expectedKey)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
    .map(goal => ({
      id: goal.id,
      title: goal.title,
      percent: Math.min(100, Math.max(0, Math.round(index.rolledProgress.get(goal.id) ?? goal.progress))),
      completed: goal.status === 'completed',
    }))
  return { level, items }
}

const focusOfPeriod = (
  blocks: TimeBlock[],
  period: ReviewPeriod,
  start: string,
  end: string,
): SnapshotFocus => {
  const index = buildStatsIndex(blocks)
  const summary = summarize(index, GRANULARITY_OF_PERIOD[period], start)
  const dates = datesInRange(start, end)
  return {
    hours: summary.totalHours,
    categories: summary.categories.map(item => ({ category: item.category, hours: item.hours })),
    daily: dates
      .map(date => ({ date, hours: index.byDay.get(date)?.totalHours ?? 0 }))
      .filter(item => item.hours > 0 || dates.length <= 31),
    excluded: index.abnormal.filter(hit => hit.block.date >= start && hit.block.date <= end).length,
  }
}

const dailySnapshot = (input: ReviewSnapshotInput): ReviewSnapshot => {
  const { key, todos, habits, days, finance, timeBlocks, goals } = input
  const view = buildTodayView({ todos, habits, days, finance, timeBlocks, goals, today: key })
  const range = reviewRangeOf('daily', key)

  const doneToday = todos.filter(todo => todo.completed && todo.due_date === key)
  const focusIndex = buildStatsIndex(timeBlocks)
  const dayBucket = focusIndex.byDay.get(key)
  const categories = dayBucket
    ? Array.from(dayBucket.byCategory.entries())
      .map(([category, agg]) => ({ category, hours: agg.hours }))
      .sort((a, b) => b.hours - a.hours || a.category.localeCompare(b.category))
    : []

  const habitRows: SnapshotHabitRow[] = habits
    .map(habit => {
      const due = habitDue(habit, key) ? 1 : 0
      const checked = habit.check_dates.includes(key)
      return {
        id: habit.id,
        name: habit.name || habit.title,
        due,
        done: due && checked ? 1 : 0,
        extra: !due && checked ? 1 : 0,
      }
    })
    .filter(row => row.due > 0 || row.extra > 0)

  return {
    period: 'daily',
    key,
    label: reviewLabel('daily', key),
    range,
    todos: {
      total: doneToday.length + view.todoPending,
      done: doneToday.length,
      pending: view.todoPending,
      rate: rateOf(doneToday.length, doneToday.length + view.todoPending),
      items: doneToday,
    },
    habits: {
      due: view.habitDueTotal,
      done: view.habitDueDone,
      extra: habitRows.reduce((sum, row) => sum + row.extra, 0),
      rate: rateOf(view.habitDueDone, view.habitDueTotal),
      items: habitRows,
    },
    focus: {
      hours: view.focusHours,
      categories,
      daily: [{ date: key, hours: view.focusHours }],
      excluded: focusIndex.abnormal.filter(hit => hit.block.date === key).length,
    },
    goals: goalItemsOf(goals, 'day', key, key),
    finance: { expense: view.finance.expense, income: view.finance.income, count: view.finance.count },
  }
}

const periodSnapshot = (input: ReviewSnapshotInput): ReviewSnapshot => {
  const { period, key, todos, habits, timeBlocks, goals } = input
  const range = reviewRangeOf(period, key)
  const dates = datesInRange(range.start, range.end)

  const dueTodos = todos.filter(todo => !!todo.due_date && todo.due_date >= range.start && todo.due_date <= range.end)
  const doneTodos = dueTodos.filter(todo => todo.completed)

  const habitRows: SnapshotHabitRow[] = habits
    .map(habit => {
      let due = 0
      let done = 0
      for (const date of dates) {
        if (!habitDue(habit, date)) continue
        due += 1
        if (habit.check_dates.includes(date)) done += 1
      }
      const extra = habit.check_dates.filter(date =>
        date >= range.start && date <= range.end && !habitDue(habit, date),
      ).length
      return { id: habit.id, name: habit.name || habit.title, due, done, extra }
    })
    .filter(row => row.due > 0 || row.extra > 0)

  const habitDueTotal = habitRows.reduce((sum, row) => sum + row.due, 0)
  const habitDoneTotal = habitRows.reduce((sum, row) => sum + row.done, 0)

  return {
    period,
    key,
    label: reviewLabel(period, key),
    range,
    todos: {
      total: dueTodos.length,
      done: doneTodos.length,
      pending: dueTodos.length - doneTodos.length,
      rate: rateOf(doneTodos.length, dueTodos.length),
      items: doneTodos,
    },
    habits: {
      due: habitDueTotal,
      done: habitDoneTotal,
      extra: habitRows.reduce((sum, row) => sum + row.extra, 0),
      rate: rateOf(habitDoneTotal, habitDueTotal),
      items: habitRows,
    },
    focus: focusOfPeriod(timeBlocks, period, range.start, range.end),
    goals: goalItemsOf(
      goals,
      GOAL_LEVEL_OF_PERIOD[period],
      range.start,
      periodKeyFor(GOAL_LEVEL_OF_PERIOD[period], range.start),
    ),
    finance: null,
  }
}

/** 唯一入口：只读入参，返回全新对象 */
export function buildReviewSnapshot(input: ReviewSnapshotInput): ReviewSnapshot {
  return input.period === 'daily' ? dailySnapshot(input) : periodSnapshot(input)
}
