import { describe, expect, it } from 'vitest'
import type { TimeBlock, Todo } from '../../../core/types'
import { buildCalendarIndex, getDayBucket } from './calendarIndex'

const todo = (id: string, dueDate?: string): Todo => ({
  id,
  title: `待办 ${id}`,
  due_date: dueDate,
  completed: false,
  list_id: 'inbox',
  pinned: false,
  status: 'todo',
  source: 'manual',
  quadrant: 'q2',
})

const block = (id: string, date: string, start = 9, end = 10): TimeBlock => ({
  id,
  date,
  start,
  end,
  title: `时间块 ${id}`,
  category: '学习',
})

describe('buildCalendarIndex', () => {
  it('todos 按 due_date、timeBlocks 按 date 一次遍历归天', () => {
    const index = buildCalendarIndex(
      [todo('t1', '2026-11-18'), todo('t2', '2026-11-18'), todo('t3', '2026-11-19')],
      [block('b1', '2026-11-18'), block('b2', '2026-11-20')],
    )

    expect(index.size).toBe(3)
    expect(getDayBucket(index, '2026-11-18').count).toBe(3)
    expect(getDayBucket(index, '2026-11-18').todos.map(item => item.id)).toEqual(['t1', 't2'])
    expect(getDayBucket(index, '2026-11-18').blocks.map(item => item.id)).toEqual(['b1'])
    expect(getDayBucket(index, '2026-11-19').count).toBe(1)
    expect(getDayBucket(index, '2026-11-20').count).toBe(1)
  })

  it('未排期待办与无日期时间块不进入索引', () => {
    const index = buildCalendarIndex([todo('no-date'), todo('ok', '2026-11-18')], [block('bad', '')])

    expect(index.size).toBe(1)
    expect(getDayBucket(index, '2026-11-18').count).toBe(1)
    expect(getDayBucket(index, 'invalid')).toMatchObject({ date: 'invalid', count: 0 })
  })

  it('桶内保持数据源原顺序，不隐式排序', () => {
    const index = buildCalendarIndex(
      [todo('t3', '2026-11-18'), todo('t1', '2026-11-18'), todo('t2', '2026-11-18')],
      [],
    )
    expect(getDayBucket(index, '2026-11-18').todos.map(item => item.id)).toEqual(['t3', 't1', 't2'])
  })

  it('计数与逐条 filter 结果完全一致', () => {
    const todos = [
      todo('t1', '2026-11-18'),
      todo('t2', '2026-11-18'),
      todo('t3', '2026-11-19'),
      todo('t4', undefined),
    ]
    const blocks = [block('b1', '2026-11-18'), block('b2', '2026-11-19'), block('b3', '2026-11-19')]
    const index = buildCalendarIndex(todos, blocks)

    const dates = new Set([...todos.map(item => item.due_date), ...blocks.map(item => item.date)])
    dates.delete(undefined)
    dates.delete('')

    dates.forEach(date => {
      const expected =
        todos.filter(item => item.due_date === date).length +
        blocks.filter(item => item.date === date).length
      expect(getDayBucket(index, String(date)).count).toBe(expected)
    })
  })

  it('getDayBucket 对缺失日期返回空桶且不写入索引', () => {
    const index = buildCalendarIndex([todo('t1', '2026-11-18')], [])
    const empty = getDayBucket(index, '2026-12-01')

    expect(empty).toEqual({ date: '2026-12-01', todos: [], blocks: [], count: 0 })
    expect(index.has('2026-12-01')).toBe(false)
    expect(index.size).toBe(1)
  })
})
