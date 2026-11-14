/**
 * UI 原子：空状态（批次 0 骨架）
 * 复用 themes.css 中既有的 .empty 样式，本批次不接入任何页面。
 */
export interface EmptyStateProps {
  text?: string
  icon?: string
}

export function EmptyState({ text = '暂无数据', icon }: EmptyStateProps) {
  return (
    <div className="empty">
      {icon ? `${icon} ` : ''}
      {text}
    </div>
  )
}

export default EmptyState
