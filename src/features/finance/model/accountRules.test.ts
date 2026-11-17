import { describe, it, expect } from 'vitest'
import type { Account, Recurring, Transaction } from '../../../core/types'
import {
  accountUsage,
  planAccountMigration,
  referencesAccount,
  resolveDefaultAccountId,
  resolveSelectedAccountId,
  validateAccountInput,
} from './accountRules'

const account = (id: string, name: string): Account => ({ id, name, balance: 0, icon: '💳' })

const tx = (patch: Partial<Transaction> & { id: string }): Transaction => ({
  date: '2026-11-01',
  type: 'expense',
  category: '餐饮',
  amount: 10,
  account: '现金',
  ...patch,
})

const recurring = (patch: Partial<Recurring> & { id: string }): Recurring => ({
  name: '房租',
  amount: 1000,
  cycle: 'monthly',
  day: 1,
  category: '居住',
  account: '现金',
  start_date: '2026-01-01',
  ...patch,
})

const accounts = [account('a1', '现金'), account('a2', '微信')]

describe('validateAccountInput', () => {
  it('名称为空 / 全空格报错', () => {
    expect(validateAccountInput({ name: '', openingBalance: 0 }).name).toBeTruthy()
    expect(validateAccountInput({ name: '   ', openingBalance: 0 }).name).toBeTruthy()
  })

  it('期初允许 0 与负值，非数字报错', () => {
    expect(validateAccountInput({ name: '现金', openingBalance: 0 })).toEqual({})
    expect(validateAccountInput({ name: '现金', openingBalance: -120.5 })).toEqual({})
    expect(validateAccountInput({ name: '现金', openingBalance: NaN }).openingBalance).toBeTruthy()
  })
})

describe('resolveDefaultAccountId 五级兜底', () => {
  it('① 编辑流水时保持原账户', () => {
    expect(
      resolveDefaultAccountId(accounts, { editingAccountId: 'a2', selectedAccountId: 'a1' }),
    ).toBe('a2')
  })

  it('① 原账户已删除时按名字找回，找不到再往下走', () => {
    expect(
      resolveDefaultAccountId(accounts, { editingAccountId: 'gone', editingAccountName: '微信' }),
    ).toBe('a2')
    expect(
      resolveDefaultAccountId(accounts, { editingAccountId: 'gone', editingAccountName: '不存在' }),
    ).toBe('a1')
  })

  it('② 当前选中账户优先于上次使用', () => {
    expect(
      resolveDefaultAccountId(accounts, { selectedAccountId: 'a2', lastAccountId: 'a1' }),
    ).toBe('a2')
  })

  it('② 「全部账户 / 未归属」不算选中，回落到上次使用', () => {
    expect(
      resolveDefaultAccountId(accounts, { selectedAccountId: 'all', lastAccountId: 'a2' }),
    ).toBe('a2')
    expect(
      resolveDefaultAccountId(accounts, { selectedAccountId: 'unassigned', lastAccountId: 'a2' }),
    ).toBe('a2')
  })

  it('③ 上次使用账户已不存在时取第一项', () => {
    expect(resolveDefaultAccountId(accounts, { lastAccountId: 'gone' })).toBe('a1')
  })

  it('④ 无任何提示时默认第一项；⑤ 没有账户返回 null', () => {
    expect(resolveDefaultAccountId(accounts)).toBe('a1')
    expect(resolveDefaultAccountId([])).toBeNull()
  })
})

describe('referencesAccount / accountUsage', () => {
  it('有 account_id 时以 id 为准，不再看显示名', () => {
    const cash = account('a1', '现金')
    expect(referencesAccount(tx({ id: 't1', account_id: 'a2', account: '现金' }), cash)).toBe(false)
    expect(referencesAccount(tx({ id: 't2', account_id: 'a1', account: '别的' }), cash)).toBe(true)
  })

  it('旧流水没有 account_id 时按显示名匹配', () => {
    expect(referencesAccount(tx({ id: 't1', account: '现金' }), account('a1', '现金'))).toBe(true)
    expect(referencesAccount(tx({ id: 't2', account: '微信' }), account('a1', '现金'))).toBe(false)
  })

  it('统计流水与周期账单引用，有引用不可删', () => {
    const cash = account('a1', '现金')
    const usage = accountUsage(
      cash,
      [tx({ id: 't1', account: '现金' }), tx({ id: 't2', account: '现金' }), tx({ id: 't3', account_id: 'a2' })],
      [recurring({ id: 'r1', account_id: 'a1' }), recurring({ id: 'r2', account_id: 'a2' })],
      2,
    )
    expect(usage).toEqual({
      transactionCount: 2,
      recurringCount: 1,
      total: 3,
      canDelete: false,
      blockedByLast: false,
    })
  })

  it('无引用可删；最后一个账户永远不可删', () => {
    const cash = account('a1', '现金')
    expect(accountUsage(cash, [], [], 2)).toMatchObject({ total: 0, canDelete: true })
    expect(accountUsage(cash, [], [], 1)).toMatchObject({
      canDelete: false,
      blockedByLast: true,
    })
  })
})

describe('resolveSelectedAccountId 选中态还原', () => {
  it('存储的账户仍存在则恢复', () => {
    expect(resolveSelectedAccountId(accounts, 'a2')).toBe('a2')
  })

  it('未选 / 已删除 / 非法值回落「全部账户」', () => {
    expect(resolveSelectedAccountId(accounts, undefined)).toBe('all')
    expect(resolveSelectedAccountId(accounts, 'all')).toBe('all')
    expect(resolveSelectedAccountId(accounts, 'gone')).toBe('all')
    expect(resolveSelectedAccountId([], 'a1')).toBe('all')
  })
})

describe('planAccountMigration', () => {
  it('把 source 的流水与周期账单改到 target，其它账户不动', () => {
    const source = account('a1', '现金')
    const target = account('a2', '微信')
    const plan = planAccountMigration(
      source,
      target,
      [
        tx({ id: 't1', account_id: 'a1', account: '现金' }),
        tx({ id: 't2', account_id: 'a2', account: '微信' }),
        tx({ id: 't3', account: '现金' }),
      ],
      [recurring({ id: 'r1', account_id: 'a1', account: '现金' }), recurring({ id: 'r2', account_id: 'a2' })],
    )
    expect(plan.transactions).toEqual([
      { id: 't1', account: '微信', account_id: 'a2' },
      { id: 't3', account: '微信', account_id: 'a2' },
    ])
    expect(plan.recurrings).toEqual([{ id: 'r1', account: '微信', account_id: 'a2' }])
  })

  it('旧数据只有显示名时也会绑定目标账户 id', () => {
    const plan = planAccountMigration(
      account('a1', '现金'),
      account('a2', '微信'),
      [tx({ id: 't1', account: '现金' })],
      [],
    )
    expect(plan.transactions[0]).toEqual({ id: 't1', account: '微信', account_id: 'a2' })
  })

  it('同账户迁移返回空计划', () => {
    const plan = planAccountMigration(
      account('a1', '现金'),
      account('a1', '现金'),
      [tx({ id: 't1', account_id: 'a1' })],
      [],
    )
    expect(plan).toEqual({ transactions: [], recurrings: [] })
  })
})
