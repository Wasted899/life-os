import type { ReactNode } from 'react'

/**
 * UI 原子：弹窗容器（批次 0 骨架）
 * 复用 themes.css 中既有的 .modal-overlay / .modal / .modal-title / .modal-actions，
 * 本批次不接入任何页面，供后续批次替换各页内联弹窗结构。
 */
export interface ModalProps {
  open: boolean
  title?: ReactNode
  onClose?: () => void
  children: ReactNode
  actions?: ReactNode
  /** 点击遮罩是否关闭，默认 true */
  maskClosable?: boolean
}

export function Modal({ open, title, onClose, children, actions, maskClosable = true }: ModalProps) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={maskClosable ? onClose : undefined}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        {title ? <div className="modal-title">{title}</div> : null}
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  )
}

export default Modal
