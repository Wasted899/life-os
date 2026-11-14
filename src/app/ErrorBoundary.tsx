import { Component } from 'react'
import type { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * 页面级错误边界（批次 0 从 App.tsx 抽出，行为不变）
 * 只包裹主布局内的路由，避免单页异常导致整站白屏。
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('页面错误:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <h2>页面加载出错</h2>
          <p style={{ color: '#64748b', margin: '12px 0' }}>数据可能有问题，请刷新页面重试</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            刷新
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
