import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * UI 原子：弹窗容器（批次 0 骨架）
 * 复用 themes.css 中既有的 .modal-overlay / .modal / .modal-title / .modal-actions。
 * 必须 portal 到 body：页面里的 .card / .daily-quote 使用了 backdrop-filter，
 * 会给 position:fixed 的后代创建 containing block，导致遮罩只覆盖卡片、
 * 弹窗在矮视口下被顶出屏幕（M1-20 回归发现的顶部截断问题）。
 */
export interface ModalProps {
  open: boolean
  title?: ReactNode
  onClose?: () => void
  children: ReactNode
  actions?: ReactNode
  /** 点击遮罩是否关闭，默认 true */
  maskClosable?: boolean
  /** 弹窗面板的额外样式（如自定义宽度） */
  style?: CSSProperties
}

export function Modal({ open, title, onClose, children, actions, maskClosable = true, style }: ModalProps) {
  if (!open) return null
  return createPortal(
    <div className="modal-overlay" onClick={maskClosable ? onClose : undefined}>
      <div className="modal" style={style} onClick={(event) => event.stopPropagation()}>
        {title ? <div className="modal-title">{title}</div> : null}
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
