/**
 * 计时器分类注册表（纯函数）。
 * 存在本地 p_timer_cats，不进 DomainData、不上云；
 * 分类名会写入 time_blocks.category，因此改名不回溯历史记录。
 */

export const TIMER_CATEGORY_KEY = 'p_timer_cats'
export const FALLBACK_TIMER_CATEGORY = '其他'
export const DEFAULT_TIMER_CATEGORIES = ['学习', '工作', '生活', FALLBACK_TIMER_CATEGORY]

export interface CategoryResult {
  ok: boolean
  list: string[]
  error?: string
}

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

/** 容错：非数组、空串、重复项全部过滤，并保证「其他」始终存在 */
export function normalizeTimerCategories(raw: unknown): string[] {
  const source = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const list: string[] = []

  for (const item of source) {
    const name = clean(item)
    if (!name || seen.has(name)) continue
    seen.add(name)
    list.push(name)
  }

  if (list.length === 0) return [...DEFAULT_TIMER_CATEGORIES]
  if (!seen.has(FALLBACK_TIMER_CATEGORY)) list.push(FALLBACK_TIMER_CATEGORY)
  return list
}

export function addTimerCategory(list: string[], name: string): CategoryResult {
  const next = clean(name)
  if (!next) return { ok: false, list, error: '分类名不能为空' }
  if (list.includes(next)) return { ok: false, list, error: '分类已存在' }
  return { ok: true, list: normalizeTimerCategories([...list, next]) }
}

export function renameTimerCategory(list: string[], from: string, to: string): CategoryResult {
  const source = clean(from)
  const next = clean(to)
  if (!list.includes(source)) return { ok: false, list, error: '原分类不存在' }
  if (!next) return { ok: false, list, error: '分类名不能为空' }
  if (next !== source && list.includes(next)) return { ok: false, list, error: '分类已存在' }
  return { ok: true, list: normalizeTimerCategories(list.map(item => (item === source ? next : item))) }
}

export function removeTimerCategory(list: string[], name: string): CategoryResult {
  const target = clean(name)
  if (target === FALLBACK_TIMER_CATEGORY) return { ok: false, list, error: '「其他」不可删除' }
  if (!list.includes(target)) return { ok: false, list, error: '分类不存在' }
  if (list.length <= 1) return { ok: false, list, error: '至少保留一个分类' }
  return { ok: true, list: normalizeTimerCategories(list.filter(item => item !== target)) }
}
