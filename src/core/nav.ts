/**
 * 导航 / 路由注册表（批次 0）
 *
 * 单一职责：
 * - 只描述"有哪些模块、挂在哪个分组、路径是什么"
 * - 不 import 任何页面组件，避免 core → features 的反向依赖
 * - 页面组件的懒加载映射放在 src/App.tsx
 */

import type { ModuleId } from './types'

export type NavGroupId = 'plan' | 'life' | 'guide' | 'settings'

export interface NavItem {
  to: string
  label: string
  icon: string
  module: ModuleId
}

export interface NavGroup {
  id: NavGroupId
  title: string
  items: NavItem[]
}

/** 侧栏分组与顺序：与既有 Layout 完全一致，保证视觉不变 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'plan',
    title: '规划',
    items: [
      { to: '/', label: '今日', icon: '📅', module: 'today' },
      { to: '/todos', label: '待办清单', icon: '✅', module: 'todos' },
      { to: '/goals', label: '目标管理', icon: '🎯', module: 'goals' },
      { to: '/habits', label: '习惯打卡', icon: '🔥', module: 'habits' },
      { to: '/days', label: '重要日子', icon: '⏰', module: 'importantDays' },
      { to: '/calendar', label: '日历', icon: '📆', module: 'calendar' },
      { to: '/time', label: '时间统计', icon: '⏱️', module: 'timeStats' },
      { to: '/pomodoro', label: '番茄钟', icon: '🍅', module: 'pomodoro' },
      { to: '/review', label: '复盘', icon: '📝', module: 'review' },
    ],
  },
  {
    id: 'life',
    title: '生活',
    items: [
      { to: '/memos', label: '备忘录', icon: '📝', module: 'memos' },
      { to: '/finance', label: '记账', icon: '💰', module: 'finance' },
    ],
  },
  {
    id: 'guide',
    title: '指南',
    items: [
      { to: '/guide/baoyan', label: '保研指南', icon: '🎓', module: 'guide' },
      { to: '/guide/intern', label: '实习攻略', icon: '💼', module: 'guide' },
      { to: '/guide/contest', label: '竞赛指南', icon: '🏆', module: 'guide' },
      { to: '/guide/coding', label: '编程路线', icon: '💻', module: 'guide' },
      { to: '/guide/cet4', label: '四级备考', icon: '📖', module: 'guide' },
      { to: '/guide/kaoyan', label: '考研指南', icon: '📚', module: 'guide' },
      { to: '/guide/scholarship', label: '奖学金攻略', icon: '🏅', module: 'guide' },
      { to: '/guide/tips', label: '避坑提醒', icon: '⚠️', module: 'guide' },
    ],
  },
  {
    id: 'settings',
    title: '设置',
    items: [{ to: '/settings', label: '设置', icon: '⚙️', module: 'settings' }],
  },
]

export interface RouteDef {
  path: string
  module: ModuleId
}

/** 主布局内的路由表（不含 /login） */
export const ROUTE_DEFS: readonly RouteDef[] = [
  { path: '/', module: 'today' },
  { path: '/todos', module: 'todos' },
  { path: '/goals', module: 'goals' },
  { path: '/habits', module: 'habits' },
  { path: '/days', module: 'importantDays' },
  { path: '/calendar', module: 'calendar' },
  { path: '/time', module: 'timeStats' },
  { path: '/pomodoro', module: 'pomodoro' },
  { path: '/review', module: 'review' },
  { path: '/memos', module: 'memos' },
  { path: '/finance', module: 'finance' },
  { path: '/settings', module: 'settings' },
  { path: '/guide/:type', module: 'guide' },
]

/** 模块基础路径（不含参数路由的占位） */
export const MODULE_PATHS: Record<ModuleId, string> = {
  today: '/',
  todos: '/todos',
  goals: '/goals',
  habits: '/habits',
  importantDays: '/days',
  calendar: '/calendar',
  timeStats: '/time',
  pomodoro: '/pomodoro',
  review: '/review',
  memos: '/memos',
  finance: '/finance',
  guide: '/guide',
  settings: '/settings',
}
