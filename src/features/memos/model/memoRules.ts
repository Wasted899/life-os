import type { Memo, MemoItem, MemoKind } from '../../../core/types'

/**
 * 备忘录纯规则：分类派生 / 改名 / 删除计划、清单条目增删改、筛选排序、哈希色。
 * 不依赖 React 与 localStorage，UI 只负责持有状态和调用。
 * 所有 items 操作都返回新数组 + 新对象，调用方整体替换，禁止原地修改。
 */

/** 兜底分类：始终存在、不可改名、不可删除 */
export const DEFAULT_MEMO_CATEGORY = '其他'

/** 分类筛选的「全部」哨兵 */
export const MEMO_CATEGORY_ALL = '全部'

/** 数量上限，防止脏数据写出超大值 */
export const MAX_MEMO_ITEM_QTY = 9999

export type MemoKindFilter = MemoKind | 'all'

export interface MemoFilter {
  query?: string
  /** '全部' 或空表示不按分类过滤 */
  category?: string
  kind?: MemoKindFilter
}

export interface MemoCategoryPatch {
  id: string
  category: string
}

export interface CategoryColor {
  background: string
  color: string
  border: string
}

const trimText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** kind 缺失/非法时：有条目按清单处理，否则按普通笔记 */
export function normalizeMemoKind(value: unknown, items: readonly MemoItem[] = []): MemoKind {
  if (value === 'checklist') return 'checklist'
  if (value === 'note') return 'note'
  return items.length > 0 ? 'checklist' : 'note'
}

/** 数量归一到 1..9999 的整数，非法值（含 null/NaN/0/负数）回落 1 */
export function normalizeMemoQty(value: unknown): number {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(raw)) return 1
  const int = Math.floor(raw)
  if (int < 1) return 1
  if (int > MAX_MEMO_ITEM_QTY) return MAX_MEMO_ITEM_QTY
  return int
}

/** 分类 = 本地注册表 ∪ memo 已用分类，去重后保证「其他」存在 */
export function deriveMemoCategories(
  memos: readonly Pick<Memo, 'category'>[],
  registry: readonly string[] = [],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (value: unknown) => {
    const name = trimText(value)
    if (!name || seen.has(name)) return
    seen.add(name)
    out.push(name)
  }
  registry.forEach(push)
  memos.forEach(m => push(m.category))
  push(DEFAULT_MEMO_CATEGORY)
  return out
}

/** 某分类被多少个 memo 引用 */
export function categoryUsage(memos: readonly Pick<Memo, 'category'>[], name: string): number {
  const target = trimText(name)
  if (!target) return 0
  return memos.filter(m => trimText(m.category) === target).length
}

/** 分类名校验：空名或与已有分类重名（排除自身）时返回错误文案 */
export function validateCategoryName(
  name: unknown,
  existing: readonly string[],
  self?: string,
): string {
  const next = trimText(name)
  if (!next) return '分类名不能为空'
  const selfName = trimText(self)
  if (next !== selfName && existing.some(c => trimText(c) === next)) return '分类已存在'
  return ''
}

/** 改名计划：只返回需要写回的 patch，不修改入参 */
export function planCategoryRename(
  memos: readonly Pick<Memo, 'id' | 'category'>[],
  from: string,
  to: string,
): MemoCategoryPatch[] {
  const source = trimText(from)
  const target = trimText(to)
  if (!source || !target || source === target) return []
  if (source === DEFAULT_MEMO_CATEGORY) return []
  return memos
    .filter(m => trimText(m.category) === source)
    .map(m => ({ id: m.id, category: target }))
}

/** 删除计划：该分类下的 memo 全部归到「其他」 */
export function planCategoryDelete(
  memos: readonly Pick<Memo, 'id' | 'category'>[],
  name: string,
): MemoCategoryPatch[] {
  const source = trimText(name)
  if (!source || source === DEFAULT_MEMO_CATEGORY) return []
  return memos
    .filter(m => trimText(m.category) === source)
    .map(m => ({ id: m.id, category: DEFAULT_MEMO_CATEGORY }))
}

/** 本地注册表兜底：只保留非空字符串、去重，并保证「其他」存在 */
export function normalizeCategoryRegistry(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const name = trimText(item)
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  if (!seen.has(DEFAULT_MEMO_CATEGORY)) out.push(DEFAULT_MEMO_CATEGORY)
  return out
}

/** 新增分类：重名/空名返回原注册表（已规范化），新分类排在「其他」之前 */
export function addCategoryToRegistry(registry: readonly string[], name: string): string[] {
  const next = normalizeCategoryRegistry(registry)
  const target = trimText(name)
  if (!target || next.includes(target)) return next
  const otherIndex = next.indexOf(DEFAULT_MEMO_CATEGORY)
  if (otherIndex < 0) return [...next, target]
  return [...next.slice(0, otherIndex), target, ...next.slice(otherIndex)]
}

/** 删除分类：「其他」不可删；仅移除注册项，memo 引用由 planCategoryDelete 迁移 */
export function removeCategoryFromRegistry(registry: readonly string[], name: string): string[] {
  const next = normalizeCategoryRegistry(registry)
  const target = trimText(name)
  if (!target || target === DEFAULT_MEMO_CATEGORY) return next
  return next.filter(c => c !== target)
}

/** 改名分类：「其他」不可改名；空名/重名返回原注册表 */
export function renameCategoryInRegistry(
  registry: readonly string[],
  from: string,
  to: string,
): string[] {
  const next = normalizeCategoryRegistry(registry)
  const source = trimText(from)
  const target = trimText(to)
  if (!source || !target || source === target) return next
  if (source === DEFAULT_MEMO_CATEGORY || next.includes(target)) return next
  // 分类只存在于 memo、尚未进注册表时，改名后把新名字补进注册表
  if (!next.includes(source)) return addCategoryToRegistry(next, target)
  return next.map(c => (c === source ? target : c))
}

/** 追加条目：返回新数组，原数组与旧条目引用不变 */
export function addChecklistItem(items: readonly MemoItem[], item: MemoItem): MemoItem[] {
  const text = trimText(item.text)
  if (!text) return items.slice()
  const next: MemoItem = {
    ...item,
    text,
    done: item.done === true,
    qty: normalizeMemoQty(item.qty),
  }
  return [...items, next]
}

/** 勾选/取消：只替换目标条目对象 */
export function toggleChecklistItem(items: readonly MemoItem[], id: string): MemoItem[] {
  return items.map(item => (item.id === id ? { ...item, done: item.done !== true } : item))
}

/** 改文本：只替换目标条目对象，保留原始输入（不 trim，避免输入空格被吞） */
export function setChecklistItemText(items: readonly MemoItem[], id: string, text: string): MemoItem[] {
  const value = typeof text === 'string' ? text : ''
  return items.map(item => (item.id === id ? { ...item, text: value } : item))
}

/** 改数量：非法值回落 1 */
export function setChecklistItemQty(items: readonly MemoItem[], id: string, qty: unknown): MemoItem[] {
  const value = normalizeMemoQty(qty)
  return items.map(item => (item.id === id ? { ...item, qty: value } : item))
}

/** 删除条目 */
export function removeChecklistItem(items: readonly MemoItem[], id: string): MemoItem[] {
  return items.filter(item => item.id !== id)
}

/** 清空已购：永久移除 done === true 的条目 */
export function clearPurchased(items: readonly MemoItem[]): MemoItem[] {
  return items.filter(item => item.done !== true)
}

/** 已购进度：done 严格为 true 才计数 */
export function checklistProgress(items: readonly MemoItem[] = []): { done: number; total: number } {
  let done = 0
  for (const item of items) if (item.done === true) done += 1
  return { done, total: items.length }
}

/** 筛选：关键词命中标题 / 正文 / 清单条目文本（不区分大小写） */
export function filterMemos(memos: readonly Memo[], filter: MemoFilter = {}): Memo[] {
  const query = trimText(filter.query).toLowerCase()
  const category = trimText(filter.category)
  const kind = filter.kind ?? 'all'
  return memos.filter(m => {
    if (kind !== 'all' && normalizeMemoKind(m.kind, m.items ?? []) !== kind) return false
    if (category && category !== MEMO_CATEGORY_ALL && trimText(m.category) !== category) return false
    if (!query) return true
    const haystack = [m.title ?? '', m.content, ...(m.items ?? []).map(i => i.text)]
      .join('\n')
      .toLowerCase()
    return haystack.includes(query)
  })
}

const timeOf = (memo: Memo): number => {
  const value = Date.parse(memo.created_at)
  return Number.isFinite(value) ? value : 0
}

/** 排序：置顶优先，其次创建时间倒序；返回新数组 */
export function sortMemos(memos: readonly Memo[]): Memo[] {
  return memos.slice().sort((a, b) => {
    const pin = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    if (pin) return pin
    return timeOf(b) - timeOf(a)
  })
}

/** 分类哈希色板：柔和背景 + 深色文字 + 同色系描边 */
const CATEGORY_PALETTE: readonly CategoryColor[] = [
  { background: '#ede9fe', color: '#5b21b6', border: '#ddd6fe' },
  { background: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
  { background: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  { background: '#fef3c7', color: '#b45309', border: '#fde68a' },
  { background: '#ffe4e6', color: '#be123c', border: '#fecdd3' },
  { background: '#cffafe', color: '#0e7490', border: '#a5f3fc' },
  { background: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' },
  { background: '#ffedd5', color: '#c2410c', border: '#fed7aa' },
  { background: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  { background: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
]

/** 按分类名稳定哈希取色，不持久化颜色 */
export function categoryColor(name: string): CategoryColor {
  const text = trimText(name) || DEFAULT_MEMO_CATEGORY
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length]
}
