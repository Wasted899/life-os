/**
 * 把主题写成 :root 变量（M3-4 T1）
 *
 * 首屏由 index.html 内联脚本先写一次（防闪烁），React 挂载后由 ThemeProvider
 * 用 useLayoutEffect 再写一次，两者都调用同一份 themeToCssVars 映射。
 */
import type { Theme } from '../../core/types'
import { themeToCssVars } from './model/themeSchema'

export function syncThemeColor(theme: Theme): void {
  if (typeof document === 'undefined') return
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', theme.bg || '#f0f4f8')
}

/** 全量应用主题：CSS 变量 + body 底色 + 浏览器主题色 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const vars = themeToCssVars(theme)
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
  if (document.body) {
    document.body.style.backgroundColor = theme.bgImage ? 'transparent' : (theme.bg || '#f0f4f8')
  }
  root.setAttribute('data-mono', theme.vars?.monoNumbers ? '1' : '0')
  syncThemeColor(theme)
}
