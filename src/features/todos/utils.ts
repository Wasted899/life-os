/** 清单/分类共用的纯校验工具：颜色、图标、名称 */

const COLOR_RE = /^#[0-9a-fA-F]{6}$/

export const DEFAULT_LIST_COLOR = '#2563eb'
export const DEFAULT_CATEGORY_COLOR = '#3b82f6'
export const DEFAULT_LIST_ICON = '📁'

/** 非法颜色一律回落，避免把 undefined/简写色写进 13 域 */
export const normalizeColor = (value: unknown, fallback: string): string => {
  const text = typeof value === 'string' ? value.trim() : ''
  return COLOR_RE.test(text) ? text.toLowerCase() : fallback
}

/** 输入框即时截断：保留空值，提交时再走 normalizeIcon 回落 */
export const clampIcon = (value: unknown): string => [...String(value ?? '')].slice(0, 2).join('')

/** 图标按码点截取最多 2 个字符（兼容 emoji 代理对），空则回落 */
export const normalizeIcon = (value: unknown, fallback: string = DEFAULT_LIST_ICON): string => {
  return clampIcon(String(value ?? '').trim()) || fallback
}

export const normalizeName = (value: unknown): string => String(value ?? '').trim()

/** 清单重名判定：trim 后严格比较，excludeId 用于改名时排除自己 */
export const hasDuplicateListName = (lists: {id: string; name: string}[], name: string, excludeId?: string): boolean => {
  const target = normalizeName(name)
  if (!target) return false
  return lists.some(list => list.id !== excludeId && normalizeName(list.name) === target)
}

/** 分类允许重名，仅用于给"同名"视觉提示 */
export const hasDuplicateCategoryName = (categories: {id: string; name: string}[], name: string, excludeId?: string): boolean => {
  const target = normalizeName(name)
  if (!target) return false
  return categories.some(category => category.id !== excludeId && normalizeName(category.name) === target)
}
