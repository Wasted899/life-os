// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { NavGroup } from './nav'
import {
  MODULE_CHANGED_EVENT,
  MODULE_META,
  isModuleDisabled,
  migrateDisabledModulesStorage,
  moduleForPath,
  normalizeDisabledModules,
  readDisabledModules,
  visibleNavGroups,
  writeDisabledModules,
} from './modules'

beforeEach(() => {
  window.localStorage.clear()
})

describe('normalizeDisabledModules：口径统一与旧值兼容', () => {
  it('旧 id 映射到现行 ModuleId', () => {
    expect(normalizeDisabledModules(['days', 'time'])).toEqual(['importantDays', 'timeStats'])
  })

  it('丢弃非法值、去重、剔除不可关闭模块', () => {
    expect(
      normalizeDisabledModules(['timer', 'timer', 'nope', 42, null, 'settings', 'today']),
    ).toEqual(['timer'])
  })

  it('非数组输入一律回空数组', () => {
    expect(normalizeDisabledModules(null)).toEqual([])
    expect(normalizeDisabledModules({ timer: true })).toEqual([])
    expect(normalizeDisabledModules('timer')).toEqual([])
  })

  it('结果按固定顺序排序且幂等', () => {
    const once = normalizeDisabledModules(['memos', 'timer', 'todos', 'time'])
    expect(once).toEqual(['todos', 'timeStats', 'timer', 'memos'])
    expect(normalizeDisabledModules(once)).toEqual(once)
  })

  it('today 与 settings 永远不可关闭', () => {
    expect(MODULE_META.today.disableable).toBe(false)
    expect(MODULE_META.settings.disableable).toBe(false)
  })
})

describe('p_disabled 读写', () => {
  it('读取裸 JSON 数组并归一', () => {
    window.localStorage.setItem('p_disabled', JSON.stringify(['days', 'timer', 'unknown']))
    expect(readDisabledModules()).toEqual(['importantDays', 'timer'])
  })

  it('解析失败回空数组', () => {
    window.localStorage.setItem('p_disabled', '{oops')
    expect(readDisabledModules()).toEqual([])
  })

  it('写入只落 p_disabled，并派发同标签页事件', () => {
    const otherKey = 'planner:p_todos'
    window.localStorage.setItem(otherKey, 'keep-me')

    let fired = 0
    const listener = () => { fired += 1 }
    window.addEventListener(MODULE_CHANGED_EVENT, listener)
    try {
      writeDisabledModules(['time', 'bogus'] as never)
    } finally {
      window.removeEventListener(MODULE_CHANGED_EVENT, listener)
    }

    expect(JSON.parse(window.localStorage.getItem('p_disabled') || '[]')).toEqual(['timeStats'])
    expect(window.localStorage.getItem(otherKey)).toBe('keep-me')
    expect(fired).toBe(1)
  })

  it('迁移把旧值写回归一结果，再次执行不再写', () => {
    window.localStorage.setItem('p_disabled', JSON.stringify(['days']))
    expect(migrateDisabledModulesStorage()).toEqual(['importantDays'])
    expect(window.localStorage.getItem('p_disabled')).toBe('["importantDays"]')
    // 已归一：值不变
    expect(migrateDisabledModulesStorage()).toEqual(['importantDays'])
    expect(window.localStorage.getItem('p_disabled')).toBe('["importantDays"]')
  })
})

describe('visibleNavGroups', () => {
  const groups: NavGroup[] = [
    {
      id: 'plan',
      title: '规划',
      items: [
        { to: '/', label: '今日', icon: '📅', module: 'today' },
        { to: '/timer', label: '计时器', icon: '⏳', module: 'timer' },
      ],
    },
    {
      id: 'life',
      title: '生活',
      items: [{ to: '/memos', label: '备忘录', icon: '📝', module: 'memos' }],
    },
  ]

  it('只过滤被关闭的条目', () => {
    const visible = visibleNavGroups(groups, ['timer'])
    expect(visible).toHaveLength(2)
    expect(visible[0].items.map(item => item.module)).toEqual(['today'])
    expect(visible[1].items.map(item => item.module)).toEqual(['memos'])
  })

  it('组内条目全部关闭时连组标题一起消失', () => {
    const visible = visibleNavGroups(groups, ['memos'])
    expect(visible.map(group => group.id)).toEqual(['plan'])
  })
})

describe('moduleForPath / isModuleDisabled', () => {
  it('最长的路径优先，/timer 不会被 /time 抢走', () => {
    expect(moduleForPath('/timer')).toBe('timer')
    expect(moduleForPath('/time')).toBe('timeStats')
  })

  it('参数路由与根路径', () => {
    expect(moduleForPath('/guide/baoyan')).toBe('guide')
    expect(moduleForPath('/guide')).toBe('guide')
    expect(moduleForPath('/')).toBe('today')
    expect(moduleForPath('/unknown')).toBeNull()
  })

  it('isModuleDisabled 使用传入的关闭列表', () => {
    expect(isModuleDisabled('timer', ['timer'])).toBe(true)
    expect(isModuleDisabled('timer', ['pomodoro'])).toBe(false)
  })
})
