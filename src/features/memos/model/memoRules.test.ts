import { describe, it, expect } from 'vitest'
import type { Memo, MemoItem } from '../../../core/types'
import {
  DEFAULT_MEMO_CATEGORY,
  MAX_MEMO_ITEM_QTY,
  addCategoryToRegistry,
  addChecklistItem,
  categoryColor,
  categoryUsage,
  checklistProgress,
  clearPurchased,
  deriveMemoCategories,
  filterMemos,
  normalizeCategoryRegistry,
  normalizeMemoKind,
  normalizeMemoQty,
  planCategoryDelete,
  planCategoryRename,
  removeCategoryFromRegistry,
  removeChecklistItem,
  renameCategoryInRegistry,
  setChecklistItemQty,
  setChecklistItemText,
  sortMemos,
  toggleChecklistItem,
  validateCategoryName,
} from './memoRules'

const memo = (patch: Partial<Memo> = {}): Memo => ({
  id: 'm1',
  content: '',
  category: DEFAULT_MEMO_CATEGORY,
  pinned: false,
  completed: false,
  created_at: '2026-11-17T10:00:00.000Z',
  kind: 'note',
  items: [],
  ...patch,
})

const item = (patch: Partial<MemoItem> = {}): MemoItem => ({
  id: 'i1',
  text: '牛奶',
  done: false,
  qty: 1,
  ...patch,
})

describe('备忘录：kind 与数量归一', () => {
  it('显式 kind 原样保留', () => {
    expect(normalizeMemoKind('note', [item()])).toBe('note')
    expect(normalizeMemoKind('checklist', [])).toBe('checklist')
  })

  it('kind 缺失/非法时按条目判断', () => {
    expect(normalizeMemoKind(undefined, [item()])).toBe('checklist')
    expect(normalizeMemoKind(undefined, [])).toBe('note')
    expect(normalizeMemoKind('unknown', [])).toBe('note')
  })

  it('数量非法值全部回落 1', () => {
    expect(normalizeMemoQty(undefined)).toBe(1)
    expect(normalizeMemoQty(null)).toBe(1)
    expect(normalizeMemoQty(NaN)).toBe(1)
    expect(normalizeMemoQty(0)).toBe(1)
    expect(normalizeMemoQty(-3)).toBe(1)
    expect(normalizeMemoQty('abc')).toBe(1)
  })

  it('数量取整并钳到上限', () => {
    expect(normalizeMemoQty(2.9)).toBe(2)
    expect(normalizeMemoQty('3')).toBe(3)
    expect(normalizeMemoQty(1e6)).toBe(MAX_MEMO_ITEM_QTY)
  })
})

describe('备忘录：分类派生', () => {
  it('注册表与 memo 分类取并集去重', () => {
    const memos = [memo({ category: '想法' }), memo({ id: 'm2', category: '购物清单' })]
    expect(deriveMemoCategories(memos, ['生活', '想法'])).toEqual([
      '生活',
      '想法',
      '购物清单',
      DEFAULT_MEMO_CATEGORY,
    ])
  })

  it('注册表顺序优先', () => {
    const memos = [memo({ category: 'B' }), memo({ id: 'm2', category: 'A' })]
    expect(deriveMemoCategories(memos, ['C', 'A'])).toEqual(['C', 'A', 'B', DEFAULT_MEMO_CATEGORY])
  })

  it('忽略空名与首尾空白', () => {
    const memos = [memo({ category: '  想法  ' }), memo({ id: 'm2', category: '   ' })]
    expect(deriveMemoCategories(memos, ['', '  '])).toEqual(['想法', DEFAULT_MEMO_CATEGORY])
  })

  it('「其他」始终存在且不重复', () => {
    const withOther = deriveMemoCategories([memo({ category: '其他' })], ['其他'])
    expect(withOther).toEqual([DEFAULT_MEMO_CATEGORY])
    expect(deriveMemoCategories([], [])).toEqual([DEFAULT_MEMO_CATEGORY])
  })
})

describe('备忘录：引用计数与分类名校验', () => {
  const memos = [memo({ category: '想法' }), memo({ id: 'm2', category: '想法' }), memo({ id: 'm3', category: '生活' })]

  it('统计某分类引用数', () => {
    expect(categoryUsage(memos, '想法')).toBe(2)
    expect(categoryUsage(memos, '生活')).toBe(1)
    expect(categoryUsage(memos, '不存在')).toBe(0)
  })

  it('空分类名返回 0', () => {
    expect(categoryUsage(memos, '  ')).toBe(0)
  })

  it('分类名校验：空、重名、排除自身', () => {
    expect(validateCategoryName('  ', ['想法'])).toBe('分类名不能为空')
    expect(validateCategoryName('想法', ['想法', '生活'])).toBe('分类已存在')
    expect(validateCategoryName('想法', ['想法', '生活'], '想法')).toBe('')
    expect(validateCategoryName('新分类', ['想法'])).toBe('')
  })
})

describe('备忘录：改名与删除计划', () => {
  const memos = [memo({ id: 'm1', category: '想法' }), memo({ id: 'm2', category: '生活' }), memo({ id: 'm3', category: '想法' })]

  it('改名只返回目标分类的 patch', () => {
    expect(planCategoryRename(memos, '想法', '灵感')).toEqual([
      { id: 'm1', category: '灵感' },
      { id: 'm3', category: '灵感' },
    ])
  })

  it('同名、空名、改名「其他」均不产生 patch', () => {
    expect(planCategoryRename(memos, '想法', '想法')).toEqual([])
    expect(planCategoryRename(memos, '想法', '  ')).toEqual([])
    expect(planCategoryRename(memos, DEFAULT_MEMO_CATEGORY, '灵感')).toEqual([])
  })

  it('删除分类时引用项归到「其他」', () => {
    expect(planCategoryDelete(memos, '想法')).toEqual([
      { id: 'm1', category: DEFAULT_MEMO_CATEGORY },
      { id: 'm3', category: DEFAULT_MEMO_CATEGORY },
    ])
  })

  it('「其他」不可删除，空名不产生 patch', () => {
    expect(planCategoryDelete(memos, DEFAULT_MEMO_CATEGORY)).toEqual([])
    expect(planCategoryDelete(memos, '  ')).toEqual([])
  })

  it('计划函数不修改入参数组与对象', () => {
    const before = memos.map(m => ({ ...m }))
    planCategoryRename(memos, '想法', '灵感')
    planCategoryDelete(memos, '想法')
    expect(memos).toEqual(before)
  })
})

describe('备忘录：本地分类注册表', () => {
  it('脏注册表归一：非数组、重复、空串，并补「其他」', () => {
    expect(normalizeCategoryRegistry(null)).toEqual([DEFAULT_MEMO_CATEGORY])
    expect(normalizeCategoryRegistry(['想法', ' 想法 ', '', 3])).toEqual(['想法', DEFAULT_MEMO_CATEGORY])
    expect(normalizeCategoryRegistry(['其他', '生活'])).toEqual(['其他', '生活'])
  })

  it('新增分类排在「其他」之前', () => {
    expect(addCategoryToRegistry(['生活', '其他'], '想法')).toEqual(['生活', '想法', '其他'])
  })

  it('新增空名或重名不变化', () => {
    expect(addCategoryToRegistry(['生活', '其他'], '  ')).toEqual(['生活', '其他'])
    expect(addCategoryToRegistry(['生活', '其他'], '生活')).toEqual(['生活', '其他'])
  })

  it('删除普通分类', () => {
    expect(removeCategoryFromRegistry(['生活', '想法', '其他'], '想法')).toEqual(['生活', '其他'])
  })

  it('「其他」不可删除', () => {
    expect(removeCategoryFromRegistry(['生活', '其他'], DEFAULT_MEMO_CATEGORY)).toEqual(['生活', '其他'])
  })

  it('改名分类，且拒绝改成已存在分类', () => {
    expect(renameCategoryInRegistry(['生活', '想法', '其他'], '想法', '灵感')).toEqual([
      '生活',
      '灵感',
      '其他',
    ])
    expect(renameCategoryInRegistry(['生活', '想法', '其他'], '想法', '生活')).toEqual([
      '生活',
      '想法',
      '其他',
    ])
    expect(renameCategoryInRegistry(['生活', '其他'], DEFAULT_MEMO_CATEGORY, '灵感')).toEqual([
      '生活',
      '其他',
    ])
  })

  it('改名只存在于 memo 的分类时，把新名字补进注册表', () => {
    expect(renameCategoryInRegistry(['生活', '其他'], '灵感', '想法')).toEqual([
      '生活',
      '想法',
      '其他',
    ])
  })
})

describe('备忘录：清单条目操作（不可变）', () => {
  it('追加条目返回新数组，原数组不变', () => {
    const original = [item()]
    const next = addChecklistItem(original, item({ id: 'i2', text: ' 鸡蛋 ' }))
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual({ id: 'i2', text: '鸡蛋', done: false, qty: 1 })
    expect(original).toHaveLength(1)
    expect(next[0]).toBe(original[0])
  })

  it('空文本不新增', () => {
    const original = [item()]
    expect(addChecklistItem(original, item({ id: 'i2', text: '   ' }))).toHaveLength(1)
  })

  it('勾选只替换目标条目，其他条目保持引用', () => {
    const a = item({ id: 'i1' })
    const b = item({ id: 'i2' })
    const next = toggleChecklistItem([a, b], 'i2')
    expect(next[0]).toBe(a)
    expect(next[1]).not.toBe(b)
    expect(next[1].done).toBe(true)
    expect(b.done).toBe(false)
  })

  it('done 非布尔时勾选视为已购的反向', () => {
    const next = toggleChecklistItem([item({ done: 'yes' as any })], 'i1')
    expect(next[0].done).toBe(true)
  })

  it('改文本只替换目标条目', () => {
    const a = item({ id: 'i1' })
    const b = item({ id: 'i2' })
    const next = setChecklistItemText([a, b], 'i2', ' 苹果 ')
    expect(next[0]).toBe(a)
    expect(next[1].text).toBe(' 苹果 ')
  })

  it('改数量按规则归一', () => {
    const next = setChecklistItemQty([item()], 'i1', '4')
    expect(next[0].qty).toBe(4)
    expect(setChecklistItemQty([item()], 'i1', 0)[0].qty).toBe(1)
  })

  it('删除条目', () => {
    const next = removeChecklistItem([item({ id: 'i1' }), item({ id: 'i2' })], 'i1')
    expect(next.map(i => i.id)).toEqual(['i2'])
  })

  it('清空已购只移除 done === true', () => {
    const kept = item({ id: 'i1', done: false })
    const bought = item({ id: 'i2', done: true })
    expect(clearPurchased([kept, bought])).toEqual([kept])
    expect(clearPurchased([item({ done: 'true' as any })])).toHaveLength(1)
  })
})

describe('备忘录：已购进度', () => {
  it('统计已购与总数', () => {
    expect(checklistProgress([item({ done: true }), item({ id: 'i2' }), item({ id: 'i3', done: true })])).toEqual({
      done: 2,
      total: 3,
    })
  })

  it('空清单与脏 done 不误计', () => {
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 })
    expect(checklistProgress([item({ done: 1 as any })])).toEqual({ done: 0, total: 1 })
  })
})

describe('备忘录：筛选', () => {
  const memos = [
    memo({ id: 'm1', title: '周末', content: '去超市买牛奶', category: '购物清单' }),
    memo({
      id: 'm2',
      content: '',
      category: '生活',
      kind: 'checklist',
      items: [item({ text: '牙膏' }), item({ id: 'i2', text: '洗发水' })],
    }),
    memo({ id: 'm3', content: '读书笔记', category: '想法' }),
  ]

  it('关键词命中正文', () => {
    expect(filterMemos(memos, { query: '牛奶' }).map(m => m.id)).toEqual(['m1'])
  })

  it('关键词命中标题', () => {
    expect(filterMemos(memos, { query: '周末' }).map(m => m.id)).toEqual(['m1'])
  })

  it('关键词命中清单条目文本', () => {
    expect(filterMemos(memos, { query: '牙膏' }).map(m => m.id)).toEqual(['m2'])
  })

  it('关键词不区分大小写与首尾空白', () => {
    const list = [memo({ id: 'm1', content: 'Buy MILK' })]
    expect(filterMemos(list, { query: '  milk ' })).toHaveLength(1)
  })

  it('按分类过滤，全部/空表示不过滤', () => {
    expect(filterMemos(memos, { category: '生活' }).map(m => m.id)).toEqual(['m2'])
    expect(filterMemos(memos, { category: '全部' })).toHaveLength(3)
    expect(filterMemos(memos, {})).toHaveLength(3)
  })

  it('按 kind 过滤', () => {
    expect(filterMemos(memos, { kind: 'checklist' }).map(m => m.id)).toEqual(['m2'])
    expect(filterMemos(memos, { kind: 'note' }).map(m => m.id)).toEqual(['m1', 'm3'])
  })
})

describe('备忘录：排序', () => {
  it('置顶优先', () => {
    const list = [
      memo({ id: 'm1', created_at: '2026-11-17T12:00:00.000Z' }),
      memo({ id: 'm2', pinned: true, created_at: '2026-11-16T12:00:00.000Z' }),
    ]
    expect(sortMemos(list).map(m => m.id)).toEqual(['m2', 'm1'])
  })

  it('同置顶状态按创建时间倒序', () => {
    const list = [
      memo({ id: 'm1', created_at: '2026-11-15T12:00:00.000Z' }),
      memo({ id: 'm2', created_at: '2026-11-17T12:00:00.000Z' }),
      memo({ id: 'm3', created_at: '2026-11-16T12:00:00.000Z' }),
    ]
    expect(sortMemos(list).map(m => m.id)).toEqual(['m2', 'm3', 'm1'])
  })

  it('返回新数组，不修改入参', () => {
    const list = [memo({ id: 'm1' }), memo({ id: 'm2', pinned: true })]
    const sorted = sortMemos(list)
    expect(sorted).not.toBe(list)
    expect(list.map(m => m.id)).toEqual(['m1', 'm2'])
  })
})

describe('备忘录：分类哈希色', () => {
  it('同名稳定同色', () => {
    expect(categoryColor('想法')).toEqual(categoryColor('想法'))
    expect(categoryColor('想法').background).toMatch(/^#/)
  })

  it('空名回落到「其他」，不同分类名可区分', () => {
    expect(categoryColor('  ')).toEqual(categoryColor(DEFAULT_MEMO_CATEGORY))
    expect(categoryColor('学习')).not.toEqual(categoryColor('工作'))
  })
})
