import {describe,expect,it} from 'vitest'
import type {Habit} from '../../core/types'
import {
  buildHabitTodoPlan,
  effectiveCustomDays,
  habitDue,
  isoWeekKey,
  maxTargetFor,
  periodRange,
  progressOf,
  validateHabitConfig,
} from './habitSchedule'

const habit = (patch: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  title: '背单词',
  frequency: 'daily',
  custom_days: [],
  check_dates: [],
  ...patch,
})

// 2026-11-14 是周六；所在 ISO 周为 2026-W46（周一 11-09 ~ 周日 11-15）
const TODAY = '2026-11-14'

describe('habitDue', () => {
  it('daily / weekdays / weekends', () => {
    expect(habitDue(habit(), '2026-11-14')).toBe(true)
    expect(habitDue(habit({ frequency: 'weekdays' }), '2026-11-14')).toBe(false)
    expect(habitDue(habit({ frequency: 'weekdays' }), '2026-11-13')).toBe(true)
    expect(habitDue(habit({ frequency: 'weekends' }), '2026-11-14')).toBe(true)
    expect(habitDue(habit({ frequency: 'weekends' }), '2026-11-13')).toBe(false)
  })

  it('custom 命中选中星期，空列表回落周一', () => {
    expect(habitDue(habit({ frequency: 'custom', custom_days: [6, 0] }), '2026-11-14')).toBe(true)
    expect(habitDue(habit({ frequency: 'custom', custom_days: [1, 3] }), '2026-11-14')).toBe(false)
    expect(effectiveCustomDays([])).toEqual([1])
  })

  it('monthly_day 只在指定日期命中（修复每天生成的 Bug）', () => {
    const h = habit({ frequency: 'monthly_day', monthly_day: 15 })
    expect(habitDue(h, '2026-11-14')).toBe(false)
    expect(habitDue(h, '2026-11-15')).toBe(true)
    expect(habitDue(h, '2026-12-15')).toBe(true)
    expect(habitDue(h, '2026-12-16')).toBe(false)
  })
})

describe('periodRange / isoWeekKey', () => {
  it('周周期从周一开始，key 为 ISO 周', () => {
    expect(periodRange(habit(), TODAY)).toEqual({
      period: 'week',
      start: '2026-11-09',
      end: '2026-11-15',
      key: '2026-W46',
    })
    expect(isoWeekKey('2026-11-09')).toBe('2026-W46')
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53')
  })

  it('月周期覆盖自然月，monthly_day 强制月周期', () => {
    expect(periodRange(habit({ target_period: 'month' }), TODAY)).toEqual({
      period: 'month',
      start: '2026-11-01',
      end: '2026-11-30',
      key: '2026-11',
    })
    expect(periodRange(habit({ frequency: 'monthly_day', target_period: 'week' }), TODAY).period).toBe('month')
  })
})

describe('maxTargetFor', () => {
  it('缺失 target_count 时按频率应做天数自动计算', () => {
    expect(maxTargetFor(habit(), TODAY)).toBe(7)
    expect(maxTargetFor(habit({ frequency: 'weekdays' }), TODAY)).toBe(5)
    expect(maxTargetFor(habit({ frequency: 'weekends' }), TODAY)).toBe(2)
    expect(maxTargetFor(habit({ frequency: 'custom', custom_days: [1, 3, 5] }), TODAY)).toBe(3)
    expect(maxTargetFor(habit({ frequency: 'monthly_day', monthly_day: 15 }), TODAY)).toBe(1)
  })

  it('显式目标优先，且不超过本周期可做天数', () => {
    expect(maxTargetFor(habit({ target_count: 3 }), TODAY)).toBe(3)
    expect(maxTargetFor(habit({ target_count: 9 }), TODAY)).toBe(7)
    expect(maxTargetFor(habit({ frequency: 'weekdays', target_count: 2 }), TODAY)).toBe(2)
  })
})

describe('progressOf', () => {
  it('分子取本周期 check_dates，超出的历史记录不计入', () => {
    const h = habit({
      target_count: 3,
      check_dates: ['2026-11-09', '2026-11-14', '2026-10-01'],
    })
    const p = progressOf(h, TODAY)
    expect(p.total).toBe(3)
    expect(p.done).toBe(2)
    expect(p.capped).toBe(2)
    expect(p.achieved).toBe(false)
    expect(p.remaining).toBe(1)
  })

  it('达到目标即视为已完成，涂色不超过总格数', () => {
    const h = habit({ target_count: 2, check_dates: ['2026-11-09', '2026-11-10', '2026-11-11'] })
    const p = progressOf(h, TODAY)
    expect(p.done).toBe(3)
    expect(p.capped).toBe(2)
    expect(p.achieved).toBe(true)
    expect(p.remaining).toBe(0)
  })
})

describe('buildHabitTodoPlan', () => {
  it('daily 生成 [本周一, 今天+6] 内的全部日期', () => {
    const plan = buildHabitTodoPlan([habit()], TODAY)
    expect(plan.map(item => item.dueDate)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ])
  })

  it('custom 只生成选中星期', () => {
    const plan = buildHabitTodoPlan([habit({ frequency: 'custom', custom_days: [1, 3, 5] })], TODAY)
    expect(plan.map(item => item.dueDate)).toEqual([
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
      '2026-11-16',
      '2026-11-18',
      '2026-11-20',
    ])
  })

  it('monthly_day 从月初扫描但只生成指定日期', () => {
    const plan = buildHabitTodoPlan([habit({ frequency: 'monthly_day', monthly_day: 15 })], TODAY)
    expect(plan).toEqual([
      { habitId: 'h1', title: '背单词', categoryId: '', dueDate: '2026-11-15' },
    ])
  })

  it('同一 habit + due_date 去重', () => {
    const plan = buildHabitTodoPlan([habit(), habit()], TODAY)
    expect(plan).toHaveLength(12)
  })
})

describe('validateHabitConfig', () => {
  it('拦截超过每周上限的目标', () => {
    expect(validateHabitConfig({ frequency: 'daily', target_count: 8, target_period: 'week' })).toBe('每天每周最多 7 次')
    expect(validateHabitConfig({ frequency: 'weekdays', target_count: 6, target_period: 'week' })).toBe('工作日每周最多 5 次')
    expect(validateHabitConfig({ frequency: 'custom', custom_days: [1, 2], target_count: 3, target_period: 'week' })).toBe('自定义星期每周最多 2 次')
  })

  it('拦截 monthly_day 的非法周期与次数', () => {
    expect(validateHabitConfig({ frequency: 'monthly_day', target_period: 'week', target_count: 1, monthly_day: 15 })).toBe('「每月某日」只能按自然月统计')
    expect(validateHabitConfig({ frequency: 'monthly_day', target_period: 'month', target_count: 3, monthly_day: 15 })).toBe('「每月某日」的目标次数固定为 1')
    expect(validateHabitConfig({ frequency: 'monthly_day', target_period: 'month', target_count: 1, monthly_day: 0 })).toBe('请选择 1-31 之间的日期')
  })

  it('合法组合返回 null，空目标表示自动', () => {
    expect(validateHabitConfig({ frequency: 'daily', target_count: 3, target_period: 'week' })).toBeNull()
    expect(validateHabitConfig({ frequency: 'daily', target_count: '', target_period: 'week' })).toBeNull()
    expect(validateHabitConfig({ frequency: 'daily', target_count: 30, target_period: 'month' })).toBeNull()
    expect(validateHabitConfig({ frequency: 'monthly_day', target_period: 'month', target_count: 1, monthly_day: 31 })).toBeNull()
  })
})
