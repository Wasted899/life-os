import { describe, it, expect } from 'vitest'
import type { FinanceCategory, Transaction } from '../../../core/types'
import {
  categoriesOfType,
  categoryLabel,
  categoryUsage,
  planCategoryRemoval,
  planCategoryRename,
  validateCategoryInput,
} from './categoryRules'

const cat = (id: string, name: string, type: 'expense' | 'income'): FinanceCategory => ({
  id,
  name,
  type,
  color: '#10b981',
  icon: '📦',
})

const tx = (patch: Partial<Transaction> & { id: string }): Transaction => ({
  date: '2026-11-01',
  type: 'expense',
  category: '餐饮',
  amount: 10,
  account: '现金',
  ...patch,
})

const categories = [cat('c1', '餐饮', 'expense'), cat('c2', '学习', 'expense'), cat('c3', '生活费', 'income')]

describe('validateCategoryInput', () => {
  it('名称必填，全空格同样报错', () => {
    expect(validateCategoryInput({ name: '', type: 'expense' }).name).toBeTruthy()
    expect(validateCategoryInput({ name: '  ', type: 'expense' }).name).toBeTruthy()
    expect(validateCategoryInput({ name: '餐饮', type: 'expense' })).toEqual({})
  })
})

describe('categoriesOfType', () => {
  it('只返回与方向匹配的分类', () => {
    expect(categoriesOfType(categories, 'expense').map((item) => item.name)).toEqual(['餐饮', '学习'])
    expect(categoriesOfType(categories, 'income').map((item) => item.name)).toEqual(['生活费'])
  })

  it('空数组返回空数组', () => {
    expect(categoriesOfType([], 'expense')).toEqual([])
  })
})

describe('categoryUsage / planCategoryRemoval', () => {
  it('只统计同名且同方向的流水', () => {
    const usage = categoryUsage(cat('c1', '餐饮', 'expense'), [
      tx({ id: 't1', category: '餐饮', type: 'expense' }),
      tx({ id: 't2', category: '餐饮', type: 'income' }),
      tx({ id: 't3', category: '学习', type: 'expense' }),
    ])
    expect(usage).toBe(1)
  })

  it('删除计划把引用流水置空（落到未分类），不碰其它分类', () => {
    const plan = planCategoryRemoval(cat('c1', '餐饮', 'expense'), [
      tx({ id: 't1', category: '餐饮' }),
      tx({ id: 't2', category: '学习' }),
      tx({ id: 't3', category: '' }),
    ])
    expect(plan).toEqual([{ id: 't1', category: '' }])
  })

  it('无引用时计划为空', () => {
    expect(planCategoryRemoval(cat('c1', '餐饮', 'expense'), [tx({ id: 't1', category: '学习' })])).toEqual([])
  })
})

describe('planCategoryRename', () => {
  it('改名同步同名同方向的流水，其它不动', () => {
    const plan = planCategoryRename(cat('c1', '餐饮', 'expense'), '吃饭', [
      tx({ id: 't1', category: '餐饮', type: 'expense' }),
      tx({ id: 't2', category: '餐饮', type: 'income' }),
      tx({ id: 't3', category: '学习', type: 'expense' }),
    ])
    expect(plan).toEqual([{ id: 't1', category: '吃饭' }])
  })

  it('名称未变返回空计划', () => {
    expect(planCategoryRename(cat('c1', '餐饮', 'expense'), '餐饮', [tx({ id: 't1', category: '餐饮' })])).toEqual([])
  })
})

describe('categoryLabel', () => {
  it('存在的分类保留原名，空值与已删除分类都显示「未分类」', () => {
    expect(categoryLabel('餐饮', categories)).toBe('餐饮')
    expect(categoryLabel('', categories)).toBe('未分类')
    expect(categoryLabel('已删除的分类', categories)).toBe('未分类')
  })
})
