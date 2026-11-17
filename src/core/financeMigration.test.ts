import { describe, it, expect } from 'vitest'
import { migrate } from './migrate'

const sources = (accounts: unknown[], transactions: unknown[]) => ({ accounts, transactions })

const baseAccounts = () => [
  { id: 'a', name: '微信', balance: 100, icon: '💳' },
]

const baseTransactions = () => [
  { id: 't1', date: '2026-11-01', type: 'income', category: '工资', amount: 50, account: '微信', account_id: 'a' },
  { id: 't2', date: '2026-11-02', type: 'expense', category: '餐饮', amount: 20, account: '微信', account_id: 'a' },
]

describe('M2 期初余额迁移', () => {
  it('opening_balance = balance − 该账户全部流水净额，balance 原样保留', () => {
    const { data } = migrate(sources(baseAccounts(), baseTransactions()))
    expect(data.accounts[0].opening_balance).toBe(70)
    expect(data.accounts[0].balance).toBe(100)
  })

  it('同一份数据迁移两次结果一致（幂等，不重复折算）', () => {
    const first = migrate(sources(baseAccounts(), baseTransactions()))
    const second = migrate(sources(first.data.accounts, first.data.transactions))
    expect(second.data.accounts[0].opening_balance).toBe(70)
    expect(second.data.accounts[0].balance).toBe(100)
    expect(second.report.issues.some(issue => issue.code === 'opening-backfilled')).toBe(false)
  })

  it('已存在 opening_balance 时原样保留，即使与公式不一致', () => {
    const accounts = [{ ...baseAccounts()[0], opening_balance: 999 }]
    const { data } = migrate(sources(accounts, baseTransactions()))
    expect(data.accounts[0].opening_balance).toBe(999)
  })

  it('负余额允许，并按公式折算', () => {
    const accounts = [{ id: 'a', name: '微信', balance: -50, icon: '💳' }]
    const transactions = [{ id: 't1', date: '2026-11-01', type: 'expense', category: '餐饮', amount: 20, account: '微信', account_id: 'a' }]
    const { data } = migrate(sources(accounts, transactions))
    expect(data.accounts[0].opening_balance).toBe(-30)
  })

  it('未归属流水不影响任何账户的期初折算', () => {
    const transactions = [
      { id: 't1', date: '2026-11-01', type: 'expense', category: '餐饮', amount: 20, account: '支付宝' },
    ]
    const { data } = migrate(sources(baseAccounts(), transactions))
    expect(data.accounts[0].opening_balance).toBe(100)
    expect(data.transactions[0].account_id).toBeUndefined()
  })

  it('折算使用整数分，0.1 + 0.2 不产生尾差', () => {
    const accounts = [{ id: 'a', name: '微信', balance: 0.3, icon: '💳' }]
    const transactions = [
      { id: 't1', date: '2026-11-01', type: 'income', category: '红包', amount: 0.1, account: '微信', account_id: 'a' },
      { id: 't2', date: '2026-11-02', type: 'income', category: '红包', amount: 0.2, account: '微信', account_id: 'a' },
    ]
    const { data } = migrate(sources(accounts, transactions))
    expect(data.accounts[0].opening_balance).toBe(0)
  })

  it('recurrings 补齐 type 与 account_id', () => {
    const { data } = migrate({
      accounts: baseAccounts(),
      recurrings: [{ id: 'r1', name: '房租', amount: 2000, cycle: 'monthly', day: 1, account: '微信', start_date: '2026-11-01' }],
    })
    expect(data.recurrings[0].type).toBe('expense')
    expect(data.recurrings[0].account_id).toBe('a')
  })

  it('recurrings 显式 income 时保留，匹配不到账户时 account_id 为空', () => {
    const { data } = migrate({
      accounts: baseAccounts(),
      recurrings: [{ id: 'r1', name: '工资', amount: 8000, cycle: 'monthly', day: 10, account: '银行卡', type: 'income', start_date: '2026-11-10' }],
    })
    expect(data.recurrings[0].type).toBe('income')
    expect(data.recurrings[0].account_id).toBeUndefined()
  })
})
