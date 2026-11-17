import { describe, it, expect } from 'vitest'
import type { Account, Recurring, Transaction } from '../../../core/types'
import {
  MONTHLY_CATCHUP_LIMIT,
  dueDateFor,
  nextDueOnOrAfter,
  parseNthPeriod,
  planRecurringPostings,
  recurringPostingId,
} from './recurringRules'

const account = (id: string, name: string): Account => ({ id, name, balance: 0, icon: '💳' })

const tx = (id: string): Transaction => ({
  id,
  date: '2026-11-01',
  type: 'expense',
  category: '居住',
  amount: 1000,
  account: '现金',
  account_id: 'a1',
})

const recurring = (patch: Partial<Recurring> = {}): Recurring => ({
  id: 'r1',
  name: '房租',
  amount: 1000,
  cycle: 'monthly',
  day: 1,
  category: '居住',
  account: '现金',
  account_id: 'a1',
  start_date: '2026-01-01',
  ...patch,
})

const planWith = (overrides: {
  recurrings?: Recurring[]
  transactions?: Transaction[]
  accounts?: Account[]
  today?: string
} = {}) =>
  planRecurringPostings({
    recurrings: overrides.recurrings ?? [recurring()],
    transactions: overrides.transactions ?? [],
    accounts: overrides.accounts ?? [account('a1', '现金')],
    today: overrides.today ?? '2026-11-17',
  })

describe('周期账单：应付日钳制', () => {
  it('31 日在 2 月钳到月末，闰年识别 2 月 29 日', () => {
    const rule = recurring({ day: 31 })
    expect(dueDateFor(rule, 2026, 2)).toBe('2026-02-28')
    expect(dueDateFor(rule, 2028, 2)).toBe('2028-02-29')
  })

  it('31 日在 4 月 / 6 月钳到 30 日', () => {
    const rule = recurring({ day: 31 })
    expect(dueDateFor(rule, 2026, 4)).toBe('2026-04-30')
    expect(dueDateFor(rule, 2026, 6)).toBe('2026-06-30')
  })

  it('「每月第 5 个周一」当月不存在时钳到最后一个周一', () => {
    const rule = recurring({ day: 1, custom_period: 'nth:5:1' })
    // 2026-02 只有 4 个周一 → 最后一个周一 23 日
    expect(dueDateFor(rule, 2026, 2)).toBe('2026-02-23')
    // 2026-03 有第 5 个周一 → 30 日
    expect(dueDateFor(rule, 2026, 3)).toBe('2026-03-30')
  })

  it('「第 2 个周三」按周几定位，不是按日期', () => {
    const rule = recurring({ day: 1, custom_period: 'nth:2:3' })
    expect(dueDateFor(rule, 2026, 2)).toBe('2026-02-11')
  })

  it('custom_period 非法时回落「每月某日」', () => {
    expect(parseNthPeriod('nth:9:9')).toBeNull()
    const rule = recurring({ day: 15, custom_period: 'weekday' })
    expect(dueDateFor(rule, 2026, 2)).toBe('2026-02-15')
  })
})

describe('周期账单：待生成期次', () => {
  it('年度账单按 start_date 月份锚点，跨年逐期补记', () => {
    const rule = recurring({
      id: 'y1',
      cycle: 'yearly',
      day: 29,
      start_date: '2024-02-29',
      next_date: '2024-02-29',
    })
    const plan = planWith({ recurrings: [rule], today: '2026-03-01' })
    expect(plan.creates.map((item) => item.date)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
    ])
    expect(plan.creates.map((item) => item.id)).toEqual([
      'rec_y1_2024',
      'rec_y1_2025',
      'rec_y1_2026',
    ])
    expect(plan.nextDates).toEqual([{ id: 'y1', next_date: '2027-02-28' }])
  })

  it('月度一次最多补 12 期，剩余期次留到下次触发', () => {
    const rule = recurring({ start_date: '2020-01-01' })
    const plan = planWith({ recurrings: [rule], today: '2026-11-17' })
    expect(plan.creates).toHaveLength(MONTHLY_CATCHUP_LIMIT)
    expect(plan.creates[0].date).toBe('2020-01-01')
    expect(plan.creates[11].date).toBe('2020-12-01')
    expect(plan.nextDates).toEqual([{ id: 'r1', next_date: '2021-01-01' }])
    expect(plan.warnings.map((item) => item.code)).toContain('catchup-limited')
  })

  it('年度一次最多补 3 期', () => {
    const rule = recurring({
      cycle: 'yearly',
      start_date: '2020-01-01',
      next_date: '2020-01-01',
    })
    const plan = planWith({ recurrings: [rule], today: '2026-11-17' })
    expect(plan.creates.map((item) => item.date)).toEqual([
      '2020-01-01',
      '2021-01-01',
      '2022-01-01',
    ])
    expect(plan.nextDates).toEqual([{ id: 'r1', next_date: '2023-01-01' }])
  })

  it('暂停的周期账单不生成、也不推进游标', () => {
    const rule = recurring({ paused: true, next_date: '2026-01-01' })
    const plan = planWith({ recurrings: [rule] })
    expect(plan.creates).toEqual([])
    expect(plan.nextDates).toEqual([])
  })

  it('删除已生成流水后刷新不复活（游标已推进）', () => {
    const rule = recurring({ next_date: '2026-12-01' })
    const plan = planWith({ recurrings: [rule], transactions: [] })
    expect(plan.creates).toEqual([])
    expect(plan.nextDates).toEqual([])
  })

  it('next_date 缺失时从 start_date 自愈，且跳过 start_date 之前的应付日', () => {
    const rule = recurring({ start_date: '2026-09-15' })
    const plan = planWith({ recurrings: [rule] })
    expect(plan.creates.map((item) => item.date)).toEqual(['2026-10-01', '2026-11-01'])
    expect(plan.nextDates).toEqual([{ id: 'r1', next_date: '2026-12-01' }])
  })

  it('期次尚未到期时不提前生成', () => {
    const rule = recurring({ next_date: '2027-01-15', start_date: '2027-01-15', day: 15 })
    const plan = planWith({ recurrings: [rule] })
    expect(plan.creates).toEqual([])
    expect(plan.nextDates).toEqual([])
  })

  it('第 n 个周几的月度补记逐期生成', () => {
    const rule = recurring({ custom_period: 'nth:5:1', day: 1 })
    const plan = planWith({ recurrings: [rule], today: '2026-03-31' })
    expect(plan.creates.map((item) => item.date)).toEqual([
      '2026-01-26',
      '2026-02-23',
      '2026-03-30',
    ])
  })
})

describe('周期账单：幂等与并发', () => {
  it('流水 id 是确定性的 rec_<id>_<期次>', () => {
    expect(recurringPostingId('r1', '2026-11')).toBe('rec_r1_2026-11')
    const plan = planWith({ recurrings: [recurring({ next_date: '2026-11-01' })] })
    expect(plan.creates[0].id).toBe('rec_r1_2026-11')
  })

  it('两台设备同 id：本地已有同 id 流水时不再生成', () => {
    const first = planWith({ recurrings: [recurring({ next_date: '2026-11-01' })] })
    expect(first.creates).toHaveLength(1)

    const second = planWith({
      recurrings: [recurring({ next_date: '2026-11-01' })],
      transactions: [tx(first.creates[0].id)],
    })
    expect(second.creates).toEqual([])
    expect(second.nextDates).toEqual([{ id: 'r1', next_date: '2026-12-01' }])
  })

  it('云端已有、本地 next_date 还是旧值时按已生成流水收敛，不重复', () => {
    const plan = planWith({
      recurrings: [recurring({ next_date: '2026-10-01' })],
      transactions: [tx('rec_r1_2026-10'), tx('rec_r1_2026-11')],
    })
    expect(plan.creates).toEqual([])
    expect(plan.nextDates).toEqual([{ id: 'r1', next_date: '2026-12-01' }])
  })
})

describe('周期账单：账户兜底', () => {
  const accounts = [account('a1', '现金'), account('a2', '微信')]

  it('account_id 命中优先（即使名称已过期）', () => {
    const plan = planWith({
      recurrings: [recurring({ account_id: 'a2', account: '现金', next_date: '2026-11-01' })],
      accounts,
    })
    expect(plan.creates[0].account).toBe('微信')
    expect(plan.creates[0].account_id).toBe('a2')
  })

  it('没有 account_id 时按账户名精确匹配', () => {
    const plan = planWith({
      recurrings: [recurring({ account_id: undefined, account: '微信', next_date: '2026-11-01' })],
      accounts,
    })
    expect(plan.creates[0].account_id).toBe('a2')
  })

  it('id 与名称都匹配不到时回落到第一个账户', () => {
    const plan = planWith({
      recurrings: [recurring({ account_id: 'missing', account: '已删除账户', next_date: '2026-11-01' })],
      accounts,
    })
    expect(plan.creates[0].account_id).toBe('a1')
  })

  it('一个账户都没有时跳过生成并给出「缺少账户」', () => {
    const plan = planWith({ accounts: [] })
    expect(plan.creates).toEqual([])
    expect(plan.nextDates).toEqual([])
    expect(plan.warnings[0].code).toBe('missing-account')
  })

  it('单条缺少账户不影响其它周期账单', () => {
    const plan = planWith({
      recurrings: [
        recurring({ id: 'r1', next_date: '2026-11-01' }),
        recurring({ id: 'r2', next_date: '2026-11-01' }),
      ],
      accounts: [account('a1', '现金')],
    })
    expect(plan.creates.map((item) => item.recurring_id)).toEqual(['r1', 'r2'])
  })
})

describe('周期账单：其它规则', () => {
  it('收入方向与备注按规则生成', () => {
    const rule = recurring({ type: 'income', name: '兼职工资', category: '兼职', next_date: '2026-11-01' })
    const plan = planWith({ recurrings: [rule] })
    expect(plan.creates[0].type).toBe('income')
    expect(plan.creates[0].note).toBe('兼职工资')
    expect(plan.creates[0].category).toBe('兼职')
  })

  it('暂停恢复后从今天起算，不补记暂停期间', () => {
    const rule = recurring({ day: 1, next_date: '2026-08-01' })
    expect(nextDueOnOrAfter(rule, '2026-11-17')).toBe('2026-12-01')
  })
})
