import type { Account, Transaction } from '../../../core/types'
import { fromCents, toCents } from './money'

export interface LedgerBucket {
  incomeCents: number
  expenseCents: number
  count: number
}

export interface Ledger {
  /** key = account_id */
  byAccount: Map<string, LedgerBucket>
  /** account_id 缺失的历史流水，单独统计，不计入任何账户余额 */
  unassigned: LedgerBucket
}

const emptyBucket = (): LedgerBucket => ({ incomeCents: 0, expenseCents: 0, count: 0 })

/** 按账户分桶；金额统一转整数分，避免浮点累加误差 */
export function buildLedger(transactions: Transaction[]): Ledger {
  const byAccount = new Map<string, LedgerBucket>()
  const unassigned = emptyBucket()

  for (const tx of transactions) {
    const accountId = typeof tx.account_id === 'string' ? tx.account_id : ''
    const bucket = accountId
      ? byAccount.get(accountId) || emptyBucket()
      : unassigned
    const cents = toCents(tx.amount)
    if (tx.type === 'income') bucket.incomeCents += cents
    else bucket.expenseCents += cents
    bucket.count += 1
    if (accountId) byAccount.set(accountId, bucket)
  }

  return { byAccount, unassigned }
}

/** 账户净额（分）：收入 − 支出 */
export function netCentsOf(ledger: Ledger, accountId: string): number {
  const bucket = ledger.byAccount.get(accountId)
  if (!bucket) return 0
  return bucket.incomeCents - bucket.expenseCents
}

/**
 * 期初余额。
 * 优先读 opening_balance；尚未迁移的旧数据（含云端旧行）回落到 balance，
 * 即“把存储值当作当前余额”，避免在迁移前重复叠加流水。
 */
export function openingBalanceOf(account: Account): number {
  if (typeof account.opening_balance === 'number' && Number.isFinite(account.opening_balance)) {
    return account.opening_balance
  }
  return Number.isFinite(account.balance) ? account.balance : 0
}

/** 当前余额 = 期初 + 该账户全部流水净额（不限月份） */
export function currentBalance(account: Account, ledger: Ledger): number {
  return fromCents(toCents(openingBalanceOf(account)) + netCentsOf(ledger, account.id))
}

/** 总资产 = 所有账户当前余额之和（含负余额，不含未归属流水） */
export function totalAssets(accounts: Account[], ledger: Ledger): number {
  let cents = 0
  for (const account of accounts) {
    cents += toCents(openingBalanceOf(account)) + netCentsOf(ledger, account.id)
  }
  return fromCents(cents)
}
