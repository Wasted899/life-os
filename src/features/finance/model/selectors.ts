import type { Transaction } from '../../../core/types'
import { fromCents, toCents } from './money'

export type AccountFilter = 'all' | 'unassigned' | (string & {})

export interface FinanceFilter {
  /** 'all' 全部（含未归属）；'unassigned' 仅未归属；其它值按 account_id 精确匹配 */
  accountId?: AccountFilter
  /** YYYY-MM */
  month?: string
  /** YYYY */
  year?: string
}

export interface FinanceSummary {
  income: number
  expense: number
  /** 收入 − 支出 */
  net: number
  count: number
}

export interface FinanceDaySummary {
  expense: number
  income: number
  count: number
  topCategory: string
  topCategoryAmount: number
}

const dateOf = (tx: Transaction): string => (typeof tx.date === 'string' ? tx.date : '')

/** 按账户 / 月份 / 年份筛选；不传条件即全部 */
export function filterTransactions(
  transactions: Transaction[],
  filter: FinanceFilter = {},
): Transaction[] {
  const { accountId, month, year } = filter
  return transactions.filter((tx) => {
    if (accountId && accountId !== 'all') {
      if (accountId === 'unassigned') {
        if (tx.account_id) return false
      } else if (tx.account_id !== accountId) {
        return false
      }
    }
    const date = dateOf(tx)
    if (month && date.slice(0, 7) !== month) return false
    if (year && date.slice(0, 4) !== year) return false
    return true
  })
}

/** 汇总收入 / 支出 / 结余 / 笔数，内部按整数分累加 */
export function summarizeTransactions(transactions: Transaction[]): FinanceSummary {
  let incomeCents = 0
  let expenseCents = 0
  for (const tx of transactions) {
    const cents = toCents(tx.amount)
    if (tx.type === 'income') incomeCents += cents
    else expenseCents += cents
  }
  return {
    income: fromCents(incomeCents),
    expense: fromCents(expenseCents),
    net: fromCents(incomeCents - expenseCents),
    count: transactions.length,
  }
}

/** 月度汇总；accountId 默认全部账户 */
export function monthSummary(
  transactions: Transaction[],
  month: string,
  accountId: AccountFilter = 'all',
): FinanceSummary {
  return summarizeTransactions(filterTransactions(transactions, { accountId, month }))
}

/** 年度汇总；accountId 默认全部账户 */
export function yearSummary(
  transactions: Transaction[],
  year: string,
  accountId: AccountFilter = 'all',
): FinanceSummary {
  return summarizeTransactions(filterTransactions(transactions, { accountId, year }))
}

/** 首页「今日记账」摘要；输出结构与 TodayFinance 保持一致 */
export function financeSummaryOfDay(
  transactions: Transaction[],
  date: string,
): FinanceDaySummary {
  let expenseCents = 0
  let incomeCents = 0
  let count = 0
  const byCategory = new Map<string, number>()

  for (const tx of transactions) {
    if (dateOf(tx) !== date) continue
    const cents = toCents(tx.amount)
    if (tx.type === 'expense') {
      expenseCents += cents
      count += 1
      byCategory.set(tx.category, (byCategory.get(tx.category) || 0) + cents)
    } else if (tx.type === 'income') {
      incomeCents += cents
    }
  }

  let topCategory = ''
  let topCategoryCents = 0
  byCategory.forEach((cents, category) => {
    if (cents > topCategoryCents) {
      topCategory = category
      topCategoryCents = cents
    }
  })

  return {
    expense: fromCents(expenseCents),
    income: fromCents(incomeCents),
    count,
    topCategory,
    topCategoryAmount: fromCents(topCategoryCents),
  }
}
