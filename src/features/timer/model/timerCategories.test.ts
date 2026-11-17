import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIMER_CATEGORIES,
  addTimerCategory,
  normalizeTimerCategories,
  removeTimerCategory,
  renameTimerCategory,
} from './timerCategories'

describe('normalizeTimerCategories', () => {
  it('非数组回落到默认分类', () => {
    expect(normalizeTimerCategories(null)).toEqual(DEFAULT_TIMER_CATEGORIES)
    expect(normalizeTimerCategories('学习')).toEqual(DEFAULT_TIMER_CATEGORIES)
  })

  it('去空、去重、去首尾空格，并补齐「其他」', () => {
    expect(normalizeTimerCategories([' 学习 ', '', '学习', '工作'])).toEqual(['学习', '工作', '其他'])
  })
})

describe('分类增删改', () => {
  const base = ['学习', '工作', '其他']

  it('新增成功；空名与重名失败', () => {
    expect(addTimerCategory(base, '运动')).toEqual({ ok: true, list: ['学习', '工作', '其他', '运动'] })
    expect(addTimerCategory(base, '  ').ok).toBe(false)
    expect(addTimerCategory(base, '工作').ok).toBe(false)
  })

  it('改名成功；改成已存在的名字失败', () => {
    expect(renameTimerCategory(base, '工作', '搬砖')).toEqual({ ok: true, list: ['学习', '搬砖', '其他'] })
    expect(renameTimerCategory(base, '工作', '学习').ok).toBe(false)
    expect(renameTimerCategory(base, '不存在', '学习').ok).toBe(false)
  })

  it('「其他」不可删，最后一个分类不可删', () => {
    expect(removeTimerCategory(base, '其他').ok).toBe(false)
    expect(removeTimerCategory(['其他'], '其他').ok).toBe(false)
    expect(removeTimerCategory(base, '工作')).toEqual({ ok: true, list: ['学习', '其他'] })
  })
})
