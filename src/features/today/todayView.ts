/**
 * 首页「今日」只读聚合（M1-18）
 *
 * 纪律（勿破）：
 * 1. 不 import React / DataContext / storage，函数无任何写操作
 * 2. 当前日期由参数 today 传入，函数内不调用 dayjs() 取“现在”，保证可测、可复现
 * 3. 口径与各模块一致：待办按严格日期、习惯按 habitDue/progressOf、目标按 buildGoalIndex 汇总
 */
import type {
  Goal,
  GoalLevel,
  Habit,
  ImportantDay,
  TimeBlock,
  Todo,
  Transaction,
} from '../../core/types'
import { habitDue, progressOf, type HabitProgress } from '../habits/habitSchedule'
import { buildGoalIndex, goalLevelOf, goalPeriodKeyOf, periodKeyFor, GOAL_LEVELS } from '../goals/goalTree'
import { financeSummaryOfDay } from '../finance/model/selectors'

/** 各卡片最多展示条数 */
export const TODAY_LIMITS = {
  todos: 6,
  habits: 6,
  days: 3,
  goals: 3,
} as const

export interface TodayTodoItem {
  todo: Todo
  /** due_date < today */
  overdue: boolean
}

export interface TodayHabitItem {
  habit: Habit
  checked: boolean
  progress: HabitProgress
}

export interface TodayDayItem {
  day: ImportantDay
  /** 距今自然日数，0 = 今天 */
  daysLeft: number
}

export interface TodayGoalItem {
  goal: Goal
  level: GoalLevel
  periodKey: string
  /** 有子目标时为等权汇总值；否则为自身 progress */
  percent: number
}

export interface TodayFinance {
  expense: number
  income: number
  /** 今日支出笔数 */
  count: number
  topCategory: string
  topCategoryAmount: number
}

export interface TodayView {
  todos: TodayTodoItem[]
  /** 被截断未展示的待办数 */
  todoRemaining: number
  /** 待处理总数（今日到期未完成 + 逾期未完成） */
  todoPending: number
  /** 今日到期且已完成 */
  todoDoneToday: number
  overdueCount: number
  habits: TodayHabitItem[]
  habitRemaining: number
  /** 今天该做的习惯数（不含“今天不该做但已打卡”的） */
  habitDueTotal: number
  /** 今天该做且已打卡 */
  habitDueDone: number
  days: TodayDayItem[]
  daysRemaining: number
  goals: TodayGoalItem[]
  goalRemaining: number
  goalLevel: GoalLevel | null
  finance: TodayFinance
  /** 今日时间块合计小时数 */
  focusHours: number
}

export interface TodayViewInput {
  todos: Todo[]
  habits: Habit[]
  days: ImportantDay[]
  transactions: Transaction[]
  timeBlocks: TimeBlock[]
  goals: Goal[]
  /** YYYY-MM-DD */
  today: string
}

const clampPercent = (value: number): number => Math.min(100, Math.max(0, Math.round(Number(value) || 0)))

const toUtc = (iso: string): number => Date.parse(`${iso}T00:00:00Z`)

/** 自然日差（to - from）；字符串均应为 YYYY-MM-DD */
const daysBetween = (from: string, to: string): number => Math.round((toUtc(to) - toUtc(from)) / 86_400_000)

/** 逾期置顶 → 置顶任务 → 有时间的在前 → 日期早的在前 → 原顺序 */
const sortTodos = (items: TodayTodoItem[]): TodayTodoItem[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const overdue = Number(b.item.overdue) - Number(a.item.overdue)
      if (overdue) return overdue
      const pinned = Number(b.item.todo.pinned) - Number(a.item.todo.pinned)
      if (pinned) return pinned
      const timeA = a.item.todo.due_time || '99:99'
      const timeB = b.item.todo.due_time || '99:99'
      if (timeA !== timeB) return timeA < timeB ? -1 : 1
      const dateA = a.item.todo.due_date || ''
      const dateB = b.item.todo.due_date || ''
      if (dateA !== dateB) return dateA < dateB ? -1 : 1
      return a.index - b.index
    })
    .map(entry => entry.item)

const buildTodos = (todos: Todo[], today: string): Pick<TodayView, 'todos' | 'todoRemaining' | 'todoPending' | 'todoDoneToday' | 'overdueCount'> => {
  // 只认有日期的任务：未排期任务不进首页（与待办页“未排期”入口分离）
  const pending = todos.filter(todo => !todo.completed && !!todo.due_date && todo.due_date <= today)
  const items = pending.map(todo => ({ todo, overdue: (todo.due_date as string) < today }))
  const sorted = sortTodos(items)
  return {
    todos: sorted.slice(0, TODAY_LIMITS.todos),
    todoRemaining: Math.max(0, sorted.length - TODAY_LIMITS.todos),
    todoPending: sorted.length,
    todoDoneToday: todos.filter(todo => todo.completed && todo.due_date === today).length,
    overdueCount: items.filter(item => item.overdue).length,
  }
}

const buildHabits = (habits: Habit[], today: string): Pick<TodayView, 'habits' | 'habitRemaining' | 'habitDueTotal' | 'habitDueDone'> => {
  const due = habits.filter(habit => habitDue(habit, today))
  // 今天不该做但已经打卡的仍要展示，避免“打了卡却看不到”
  const checkedExtra = habits.filter(habit => !habitDue(habit, today) && habit.check_dates.includes(today))
  const items = [...due, ...checkedExtra].map(habit => ({
    habit,
    checked: habit.check_dates.includes(today),
    progress: progressOf(habit, today),
  }))
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(a.item.checked) - Number(b.item.checked) || a.index - b.index)
    .map(entry => entry.item)
  return {
    habits: sorted.slice(0, TODAY_LIMITS.habits),
    habitRemaining: Math.max(0, sorted.length - TODAY_LIMITS.habits),
    habitDueTotal: due.length,
    habitDueDone: due.filter(habit => habit.check_dates.includes(today)).length,
  }
}

const buildDays = (days: ImportantDay[], today: string): Pick<TodayView, 'days' | 'daysRemaining'> => {
  const upcoming = days
    .filter(day => day.type !== 'countup' && day.date >= today)
    .map(day => ({ day, daysLeft: daysBetween(today, day.date) }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
  return {
    days: upcoming.slice(0, TODAY_LIMITS.days),
    daysRemaining: Math.max(0, upcoming.length - TODAY_LIMITS.days),
  }
}

/**
 * 目标摘要：日 → 周 → 月 → 年，取第一个“当前周期内有目标”的层级，最多 3 条。
 * 进度取 buildGoalIndex 的汇总值（有子目标时为等权平均），不读父目标自身 progress。
 */
const buildGoals = (
  goals: Goal[],
  today: string,
): Pick<TodayView, 'goals' | 'goalRemaining' | 'goalLevel'> => {
  const index = buildGoalIndex(goals)
  const levels = [...GOAL_LEVELS].reverse()
  for (const level of levels) {
    const anchor = periodKeyFor(level, today)
    const matched = goals.filter(goal =>
      goalLevelOf(goal) === level
      && goal.status !== 'completed'
      && goalPeriodKeyOf(goal, today) === anchor,
    )
    if (!matched.length) continue
    const sorted = [...matched].sort((a, b) => a.title.localeCompare(b.title, 'zh'))
    return {
      goals: sorted.slice(0, TODAY_LIMITS.goals).map(goal => ({
        goal,
        level,
        periodKey: anchor,
        percent: clampPercent(index.rolledProgress.get(goal.id) ?? goal.progress),
      })),
      goalRemaining: Math.max(0, sorted.length - TODAY_LIMITS.goals),
      goalLevel: level,
    }
  }
  return { goals: [], goalRemaining: 0, goalLevel: null }
}

const buildFinance = (transactions: Transaction[], today: string): TodayFinance =>
  financeSummaryOfDay(transactions, today)

const buildFocusHours = (timeBlocks: TimeBlock[], today: string): number =>
  timeBlocks
    .filter(block => block.date === today)
    .reduce((sum, block) => sum + Math.max(0, block.end - block.start), 0)

/** 唯一入口：入参全部只读，返回全新对象，不修改任何输入数组 */
export function buildTodayView(input: TodayViewInput): TodayView {
  const { todos, habits, days, transactions, timeBlocks, goals, today } = input
  return {
    ...buildTodos(todos, today),
    ...buildHabits(habits, today),
    ...buildDays(days, today),
    ...buildGoals(goals, today),
    finance: buildFinance(transactions, today),
    focusHours: buildFocusHours(timeBlocks, today),
  }
}
