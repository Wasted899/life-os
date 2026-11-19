/**
 * 分类稳定取色（日历 / 时间统计共用）。
 *
 * 规则：
 * 1. 调用方提供已知分类（含 color）时优先用 name 精确匹配；
 * 2. 未匹配时按分类名哈希落到固定调色板，保证刷新、跨页面颜色一致；
 * 3. 不依赖 React，不读写存储。
 */

export const CATEGORY_PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#84cc16',
  '#f97316',
  '#6366f1',
] as const

/** 「其他」聚合扇区的固定中性色 */
export const OTHER_CATEGORY_COLOR = '#94a3b8'

const hashText = (text: string): number => {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 100000
  }
  return hash
}

export interface KnownCategory {
  name: string
  color?: string
}

export function categoryColor(name: string): string {
  const text = name || '未分类'
  return CATEGORY_PALETTE[hashText(text) % CATEGORY_PALETTE.length]
}

export function colorForCategory(
  name: string,
  known?: readonly KnownCategory[],
): string {
  const text = name || '未分类'
  if (text === '其他') return OTHER_CATEGORY_COLOR
  const matched = known?.find(item => item.name === text && !!item.color)
  return matched?.color ?? categoryColor(text)
}
