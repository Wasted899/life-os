import dayjs from 'dayjs'
import type { TimeBlock, Todo } from '../../core/types'
import { colorForCategory } from '../../core/categoryColor'
import { QUADRANT_META } from '../todos/types'
import { timelineTimeOf } from '../todos/hooks/useTodosViewData'
import type { DayBucket } from './model/calendarIndex'

/**
 * 日历视图层的数据整形：
 * - 月视图需要「统一排序后的条目列表」
 * - 时间轴需要「有具体时间的待办」与「未排期待办」两份
 *
 * 时间口径完全复用待办时间线的 timelineTimeOf（start > due_time > end），
 * 不在日历里另写一套，避免同一任务在两个模块判定不一致。
 */

export type DayEntryKind = 'todo' | 'block'

export interface DayEntry {
  key: string
  kind: DayEntryKind
  title: string
  /** HH:mm；未排期为空串 */
  timeLabel: string
  /** 当天 0 点起的分钟数；未排期为 null */
  minutes: number | null
  color: string
  completed: boolean
}

export interface TimedTodo {
  todo: Todo
  time: string
  minutes: number
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

export function minutesOf(time: string): number {
  const [hour, minute] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

/** 十进制小时 → HH:mm；24 显示为 24:00（截断后的异常块用） */
export function formatHourValue(hours: number): string {
  const safe = Math.min(24, Math.max(0, Number.isFinite(hours) ? hours : 0))
  const total = Math.round(safe * 60)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${pad2(hour)}:${pad2(minute)}`
}

export function hourLabel(hour: number): string {
  return `${pad2(hour)}:00`
}

/** 周一为一周之始的中文星期 */
export function weekdayLabel(date: string): string {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][(dayjs(date).day() + 6) % 7]
}

export function todoColor(todo: Todo): string {
  return QUADRANT_META.find(item => item.id === todo.quadrant)?.color ?? '#94a3b8'
}

/** 月视图单元格条目：有时间的按时间升序，未排期沉底，同刻保持数据源顺序 */
export function buildDayEntries(bucket: DayBucket): DayEntry[] {
  const entries: DayEntry[] = []

  bucket.todos.forEach(todo => {
    const time = timelineTimeOf(todo)
    entries.push({
      key: `todo:${todo.id}`,
      kind: 'todo',
      title: todo.title,
      timeLabel: time,
      minutes: time ? minutesOf(time) : null,
      color: todoColor(todo),
      completed: todo.completed,
    })
  })

  bucket.blocks.forEach(block => {
    entries.push({
      key: `block:${block.id}`,
      kind: 'block',
      title: block.title,
      timeLabel: formatHourValue(block.start),
      minutes: Math.round(block.start * 60),
      color: colorForCategory(block.category),
      completed: false,
    })
  })

  return entries.sort((a, b) => {
    if (a.minutes === null && b.minutes === null) return 0
    if (a.minutes === null) return 1
    if (b.minutes === null) return -1
    return a.minutes - b.minutes
  })
}

/** 时间轴：只收有具体时间的待办（规格 §4.11） */
export function timedTodos(bucket: DayBucket): TimedTodo[] {
  const result: TimedTodo[] = []
  bucket.todos.forEach(todo => {
    const time = timelineTimeOf(todo)
    if (!time) return
    result.push({ todo, time, minutes: minutesOf(time) })
  })
  return result.sort((a, b) => a.minutes - b.minutes)
}

/** 未排期待办：周视图顶部「N 条未排期」与移动端列表使用 */
export function untimedTodos(bucket: DayBucket): Todo[] {
  return bucket.todos.filter(todo => timelineTimeOf(todo) === '')
}

/** 时间块的时间文案，异常块也照实显示截断后的区间 */
export function blockTimeLabel(block: TimeBlock): string {
  return `${formatHourValue(block.start)}–${formatHourValue(block.end)}`
}
