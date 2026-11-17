import { describe, it, expect } from 'vitest'
import type { Transaction } from '../../../core/types'
import {
  financeSummaryOfDay,
  filterTransactions,
  monthSummary,
  summarizeTransactions,
  yearSummary,
} from './selectors'

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

const rows: Transaction[] = [
  tx({ id: 't1', date: '2026-11-30', type: 'expense', category: '餐饮', amount: 20, account_id: 'a' }),
  tx({ id: 't2', date: '2026-11-15', type: 'income', category: '工资', amount: 100, account_id: 'a' }),
  tx({ id: 't3', date: '2026-12-01', type: 'expense', category: '交通', amount: 10, account_id: 'b' }),
  tx({ id: 't4', date: '2025-12-31', type: 'expense', category: '房租', amount: 30, account_id: 'b' }),
  tx({ id: 't5', date: '2026-11-02', type: 'expense', category: '零食', amount: 5 }),
]

describe('selectors', () => {
  it('按账户精确筛选', () => {
    expect(filterTransactions(rows, { accountId: 'a' }).map(t => t.id)).toEqual(['t1', 't2'])
  })

  it('未归属筛选只取没有 account_id 的流水', () => {
    expect(filterTransactions(rows, { accountId: 'unassigned' }).map(t => t.id)).toEqual(['t5'])
  })

  it('全部账户包含未归属', () => {
    expect(filterTransactions(rows, { accountId: 'all' })).toHaveLength(5)
  })

  it('月份边界：月末计入、次月月初不计入', () => {
    expect(filterTransactions(rows, { month: '2026-11' }).map(t => t.id)).toEqual(['t1', 't2', 't5'])
    expect(filterTransactions(rows, { month: '2026-12' }).map(t => t.id)).toEqual(['t3'])
  })

  it('年度筛选覆盖跨年', () => {
    expect(filterTransactions(rows, { year: '2026' }).map(t => t.id)).toEqual(['t1', 't2', 't3', 't5'])
    expect(filterTransactions(rows, { year: '2025' }).map(t => t.id)).toEqual(['t4'])
  })

  it('月度汇总按整数分累加', () => {
    const summary = monthSummary(rows, '2026-11')
    expect(summary).toEqual({ income: 100, expense: 25, net: 75, count: 3 })
  })

  it('年度汇总支持账户过滤', () => {
    expect(yearSummary(rows, '2026', 'b')).toEqual({ income: 0, expense: 10, net: -10, count: 1 })
  })

  it('空数组汇总为零', () => {
    expect(summarizeTransactions([])).toEqual({ income: 0, expense: 0, net: 0, count: 0 })
  })

  it('今日摘要结构与首页一致', () => {
    const summary = financeSummaryOfDay(rows, '2026-11-30')
    expect(summary).toEqual({
      expense: 20,
      income: 0,
      count: 1,
      topCategory: '餐饮',
      topCategoryAmount: 20,
    })
  })

  it('今日摘要区分日期、统计收入与最多支出分类', () => {
    const day = [
      tx({ id: 'a', date: '2026-11-16', type: 'expense', category: '餐饮', amount: 12.5 }),
      tx({ id: 'b', date: '2026-11-16', type: 'expense', category: '交通', amount: 30 }),
      tx({ id: 'c', date: '2026-11-16', type: 'income', category: '工资', amount: 200 }),
      tx({ id: 'd', date: '2026-11-15', type: 'expense', category: '餐饮', amount: 99 }),
    ]
    expect(financeSummaryOfDay(day, '2026-11-16')).toEqual({
      expense: 42.5,
      income: 200,
      count: 2,
      topCategory: '交通',
      topCategoryAmount: 30,
    })
  })

  it('无支出时今日摘要的分类为空', () => {
    expect(financeSummaryOfDay([], '2026-11-16')).toEqual({
      expense: 0,
      income: 0,
      count: 0,
      topCategory: '',
      topCategoryAmount: 0,
    })
  })
})
