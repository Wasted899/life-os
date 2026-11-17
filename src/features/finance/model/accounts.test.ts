import { describe, it, expect } from 'vitest'
import type { Account, Transaction } from '../../../core/types'
import { buildLedger, currentBalance, netCentsOf, openingBalanceOf, totalAssets } from './accounts'

const account = (patch: Partial<Account>): Account => ({
  id: 'a',
  name: '微信',
  balance: 0,
  icon: '💳',
  ...patch,
}) as Account

const tx = (patch: Partial<Transaction>): Transaction => ({
  id: 't',
  date: '2026-11-01',
  type: 'expense',
  category: '餐饮',
  amount: 0,
  account: '微信',
  note: '',
  ...patch,
}) as Transaction

describe('accounts', () => {
  it('空账户与空流水', () => {
    const ledger = buildLedger([])
    expect(ledger.byAccount.size).toBe(0)
    expect(ledger.unassigned.count).toBe(0)
    expect(totalAssets([], ledger)).toBe(0)
    expect(currentBalance(account({ opening_balance: 10 }), ledger)).toBe(10)
  })

  it('期初 + 收入 − 支出', () => {
    const ledger = buildLedger([
      tx({ id: 't1', type: 'income', amount: 50, account_id: 'a' }),
      tx({ id: 't2', type: 'expense', amount: 20, account_id: 'a' }),
    ])
    const a = account({ opening_balance: 70 })
    expect(netCentsOf(ledger, 'a')).toBe(3000)
    expect(currentBalance(a, ledger)).toBe(100)
  })

  it('负余额允许', () => {
    const ledger = buildLedger([tx({ amount: 20, account_id: 'a' })])
    expect(currentBalance(account({ opening_balance: -50 }), ledger)).toBe(-70)
  })

  it('跨账户互不影响', () => {
    const ledger = buildLedger([
      tx({ id: 't1', type: 'income', amount: 100, account_id: 'a' }),
      tx({ id: 't2', type: 'expense', amount: 30, account_id: 'b' }),
    ])
    expect(currentBalance(account({ id: 'a', opening_balance: 0 }), ledger)).toBe(100)
    expect(currentBalance(account({ id: 'b', opening_balance: 0 }), ledger)).toBe(-30)
  })

  it('未归属流水单独统计且不计入账户与总资产', () => {
    const ledger = buildLedger([
      tx({ id: 't1', type: 'income', amount: 100, account_id: 'a' }),
      tx({ id: 't2', type: 'expense', amount: 40 }),
    ])
    expect(ledger.unassigned.count).toBe(1)
    expect(ledger.unassigned.expenseCents).toBe(4000)
    expect(currentBalance(account({ opening_balance: 0 }), ledger)).toBe(100)
    expect(totalAssets([account({ opening_balance: 0 })], ledger)).toBe(100)
  })

  it('旧账户没有 opening_balance 时回落到 balance', () => {
    const ledger = buildLedger([])
    const legacy = account({ balance: 88 })
    expect(openingBalanceOf(legacy)).toBe(88)
    expect(currentBalance(legacy, ledger)).toBe(88)
  })

  it('总资产包含负余额并保持分精度', () => {
    const ledger = buildLedger([
      tx({ id: 't1', type: 'income', amount: 0.1, account_id: 'a' }),
      tx({ id: 't2', type: 'income', amount: 0.2, account_id: 'b' }),
    ])
    const accounts = [
      account({ id: 'a', opening_balance: 0 }),
      account({ id: 'b', opening_balance: -0.3 }),
    ]
    expect(totalAssets(accounts, ledger)).toBe(0)
  })
})
