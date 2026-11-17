import type { Account, Recurring, Transaction } from '../../../core/types'

/**
 * 账户相关的纯规则：表单校验、默认账户五级兜底、引用统计、迁移计划。
 * 组件只负责取值与渲染，判定全部在这里，便于单测。
 */

export interface AccountFormInput {
  name: string
  openingBalance: number
}

export interface AccountFormErrors {
  name?: string
  openingBalance?: string
}

/** 名称非空、期初必须是合法数字（允许负值、允许 0） */
export function validateAccountInput(input: AccountFormInput): AccountFormErrors {
  const errors: AccountFormErrors = {}
  if (!input.name || !input.name.trim()) errors.name = '账户名称不能为空'
  if (!Number.isFinite(input.openingBalance)) errors.openingBalance = '期初余额必须是数字'
  return errors
}

export interface DefaultAccountQuery {
  /** 编辑现有流水时原账户 id */
  editingAccountId?: string | null
  /** 编辑现有流水时显示用的账户名（旧数据可能只有名字） */
  editingAccountName?: string | null
  /** 当前选中的账户筛选；'all' / 'unassigned' 视为未选中 */
  selectedAccountId?: string | null
  /** 上一次记账使用的账户 id（p_finance_ui.lastAccountId） */
  lastAccountId?: string | null
}

/**
 * 默认账户五级兜底：
 * ① 编辑流水且原账户仍存在 → 保持原账户
 * ② 当前选中账户（非「全部账户」/「未归属」）
 * ③ 上次使用的账户（仍需存在）
 * ④ 账户列表第一项
 * ⑤ 一个账户都没有 → null（由表单走「新建账户」）
 */
export function resolveDefaultAccountId(
  accounts: Account[],
  query: DefaultAccountQuery = {},
): string | null {
  const ids = new Set(accounts.map((account) => account.id))

  const editingId = query.editingAccountId
  if (editingId && ids.has(editingId)) return editingId
  if (query.editingAccountName) {
    const matched = accounts.find((account) => account.name === query.editingAccountName)
    if (matched) return matched.id
  }

  const selected = query.selectedAccountId
  if (selected && selected !== 'all' && selected !== 'unassigned' && ids.has(selected)) {
    return selected
  }

  const last = query.lastAccountId
  if (last && ids.has(last)) return last

  return accounts.length > 0 ? accounts[0].id : null
}

/**
 * 账户切换器的选中态还原：
 * 存储值仍指向一个存在的账户就恢复它，否则（未选 / 已删除 / 非法值）回落「全部账户」。
 */
export function resolveSelectedAccountId(
  accounts: Account[],
  storedAccountId?: string | null,
): string {
  if (!storedAccountId || storedAccountId === 'all') return 'all'
  return accounts.some((account) => account.id === storedAccountId) ? storedAccountId : 'all'
}

type AccountRefRecord = Pick<Transaction, 'id' | 'account' | 'account_id'>

/**
 * 一条记录是否引用该账户。
 * account_id 存在时以 id 为准；旧数据没有 id 时退回按显示名匹配。
 */
export function referencesAccount(
  record: AccountRefRecord,
  account: Pick<Account, 'id' | 'name'>,
): boolean {
  if (record.account_id) return record.account_id === account.id
  return record.account === account.name
}

export interface AccountUsage {
  transactionCount: number
  recurringCount: number
  total: number
  /** 无引用且不是最后一个账户才允许直接删除 */
  canDelete: boolean
  /** 是否为最后一个账户（至少保留一个） */
  blockedByLast: boolean
}

export function accountUsage(
  account: Pick<Account, 'id' | 'name'>,
  transactions: Transaction[],
  recurrings: Recurring[],
  accountCount: number,
): AccountUsage {
  const transactionCount = transactions.filter((tx) => referencesAccount(tx, account)).length
  const recurringCount = recurrings.filter((item) => referencesAccount(item, account)).length
  const total = transactionCount + recurringCount
  return {
    transactionCount,
    recurringCount,
    total,
    canDelete: accountCount > 1 && total === 0,
    blockedByLast: accountCount <= 1,
  }
}

export interface AccountRefPatch {
  id: string
  account: string
  account_id: string
}

export interface AccountMigrationPlan {
  transactions: AccountRefPatch[]
  recurrings: AccountRefPatch[]
}

/** 把 source 账户的全部引用改到 target，返回需要提交的增量补丁 */
export function planAccountMigration(
  source: Pick<Account, 'id' | 'name'>,
  target: Pick<Account, 'id' | 'name'>,
  transactions: Transaction[],
  recurrings: Recurring[],
): AccountMigrationPlan {
  if (source.id === target.id) return { transactions: [], recurrings: [] }
  const patchOf = (rows: AccountRefRecord[]): AccountRefPatch[] =>
    rows
      .filter((row) => !!row.id && referencesAccount(row, source))
      .map((row) => ({ id: row.id, account: target.name, account_id: target.id }))
  return {
    transactions: patchOf(transactions),
    recurrings: patchOf(recurrings),
  }
}
