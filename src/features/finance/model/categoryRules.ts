import type { FinanceCategory, Transaction, TransactionType } from '../../../core/types'

/**
 * 收支分类的纯规则（与待办分类完全独立）：
 * 表单校验、按方向取分类、引用统计、删除时把引用流水落到「未分类」。
 */

export interface CategoryFormInput {
  name: string
  type: TransactionType
}

export interface CategoryFormErrors {
  name?: string
}

/** 名称必填；类型由表单枚举保证 */
export function validateCategoryInput(input: CategoryFormInput): CategoryFormErrors {
  const errors: CategoryFormErrors = {}
  if (!input.name || !input.name.trim()) errors.name = '收支分类名称不能为空'
  return errors
}

/** 与流水方向匹配的分类 */
export function categoriesOfType(
  categories: FinanceCategory[],
  type: TransactionType,
): FinanceCategory[] {
  return categories.filter((category) => category.type === type)
}

/** 引用笔数：同名且同方向的流水 */
export function categoryUsage(
  category: Pick<FinanceCategory, 'name' | 'type'>,
  transactions: Transaction[],
): number {
  return transactions.filter(
    (tx) => tx.category === category.name && tx.type === category.type,
  ).length
}

export interface CategoryRefPatch {
  id: string
  category: string
}

/**
 * 改名计划：流水里存的是分类名快照，改名必须同步，否则历史流水会变成「未分类」。
 * 只产补丁，不在这里改数据。
 */
export function planCategoryRename(
  category: Pick<FinanceCategory, 'name' | 'type'>,
  nextName: string,
  transactions: Transaction[],
): CategoryRefPatch[] {
  if (!nextName || nextName === category.name) return []
  return transactions
    .filter((tx) => tx.category === category.name && tx.type === category.type)
    .map((tx) => ({ id: tx.id, category: nextName }))
}

/**
 * 删除分类前的落库计划：引用流水清空分类名，统一落到「未分类」。
 * 只产补丁，不在这里改数据。
 */
export function planCategoryRemoval(
  category: Pick<FinanceCategory, 'name' | 'type'>,
  transactions: Transaction[],
): CategoryRefPatch[] {
  return transactions
    .filter((tx) => tx.category === category.name && tx.type === category.type)
    .map((tx) => ({ id: tx.id, category: '' }))
}

/**
 * 分类显示名：分类仍存在则用分类名；空值或已被删除的历史名统一显示「未分类」，
 * 避免统计里出现找不到来源的孤儿分类。
 */
export function categoryLabel(
  categoryName: string,
  categories: FinanceCategory[],
): string {
  if (!categoryName) return '未分类'
  return categories.some((category) => category.name === categoryName) ? categoryName : '未分类'
}
