import { describe, it, expect } from 'vitest'
import type { Quote } from '../../core/types'
import { BUILTIN_QUOTES } from './builtinQuotes'
import {
  hashString,
  parseDailyQuoteRecord,
  pickDailyQuote,
  pickNextQuote,
  resolveDailyQuote,
  seedBuiltinQuotes,
  sortQuoteBank,
} from './quotes'

const quote = (id: string): Quote => ({ id, text: `text-${id}`, author: 'author', source_type: 'quote' })

const bank = [quote('q3'), quote('q1'), quote('q5'), quote('q2'), quote('q4')]

describe('内置词库', () => {
  it('42 条：11 条 lyric、31 条 quote，id 唯一且稳定前缀', () => {
    expect(BUILTIN_QUOTES).toHaveLength(42)
    expect(BUILTIN_QUOTES.filter(item => item.source_type === 'lyric')).toHaveLength(11)
    expect(BUILTIN_QUOTES.filter(item => item.source_type === 'quote')).toHaveLength(31)
    expect(new Set(BUILTIN_QUOTES.map(item => item.id)).size).toBe(42)
    expect(BUILTIN_QUOTES.every(item => item.id.startsWith('builtin-') && item.text.trim().length > 0)).toBe(true)
    // 无作者的 2 条
    expect(BUILTIN_QUOTES.filter(item => item.author === '')).toHaveLength(2)
  })
})

describe('按天哈希选条', () => {
  it('同一天多次调用稳定，且与词库顺序无关', () => {
    const first = pickDailyQuote(bank, '2026-11-14')
    const second = pickDailyQuote(bank, '2026-11-14')
    const shuffled = [...bank].reverse()
    expect(first).not.toBeNull()
    expect(second!.id).toBe(first!.id)
    expect(pickDailyQuote(shuffled, '2026-11-14')!.id).toBe(first!.id)
    expect(sortQuoteBank(bank).map(item => item.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5'])
  })

  it('不同日期会选出不同条目', () => {
    const dates = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']
    const ids = dates.map(date => pickDailyQuote(BUILTIN_QUOTES, date)!.id)
    expect(new Set(ids).size).toBeGreaterThan(1)
    expect(hashString('2026-11-14|local')).not.toBe(hashString('2026-11-15|local'))
  })

  it('词库为空返回 null', () => {
    expect(pickDailyQuote([], '2026-11-14')).toBeNull()
    expect(pickNextQuote([], 'q1')).toBeNull()
    expect(resolveDailyQuote([], null, '2026-11-14')).toBeNull()
  })
})

describe('换一条', () => {
  it('多次点击都不会选中当前条目', () => {
    let current = bank[0].id
    for (let index = 0; index < 30; index += 1) {
      const next = pickNextQuote(bank, current)
      expect(next).not.toBeNull()
      expect(next!.id).not.toBe(current)
      current = next!.id
    }
  })

  it('只有一条时返回自身', () => {
    expect(pickNextQuote([quote('only')], 'only')!.id).toBe('only')
  })
})

describe('记录序列化与回读', () => {
  it('当天记录优先于哈希结果', () => {
    const hashPick = pickDailyQuote(bank, '2026-11-14')!
    const other = bank.find(item => item.id !== hashPick.id)!
    const resolved = resolveDailyQuote(bank, { date: '2026-11-14', quoteId: other.id }, '2026-11-14')
    expect(resolved!.id).toBe(other.id)
    expect(resolved!.id).not.toBe(hashPick.id)
  })

  it('记录过期（跨天）回落到哈希选条', () => {
    const other = bank.find(item => item.id !== pickDailyQuote(bank, '2026-11-15')!.id)!
    const resolved = resolveDailyQuote(bank, { date: '2026-11-14', quoteId: other.id }, '2026-11-15')
    expect(resolved!.id).toBe(pickDailyQuote(bank, '2026-11-15')!.id)
  })

  it('记录里的 id 已不存在时回落', () => {
    const resolved = resolveDailyQuote(bank, { date: '2026-11-14', quoteId: 'removed' }, '2026-11-14')
    expect(resolved!.id).toBe(pickDailyQuote(bank, '2026-11-14')!.id)
  })

  it('非法记录返回 null', () => {
    expect(parseDailyQuoteRecord(null)).toBeNull()
    expect(parseDailyQuoteRecord('x')).toBeNull()
    expect(parseDailyQuoteRecord({ date: '2026/11/14', quoteId: 'q1' })).toBeNull()
    expect(parseDailyQuoteRecord({ date: '2026-11-14' })).toBeNull()
    expect(parseDailyQuoteRecord({ date: '2026-11-14', quoteId: 'q1' })).toEqual({ date: '2026-11-14', quoteId: 'q1' })
  })
})

describe('内置词库灌入（幂等）', () => {
  const builtin = [quote('b1'), quote('b2')]

  it('首次为空：全量灌入并置标记', () => {
    const result = seedBuiltinQuotes([], builtin, false)
    expect(result.quotes.map(item => item.id)).toEqual(['b1', 'b2'])
    expect(result.seeded).toBe(true)
    expect(result.changed).toBe(true)
  })

  it('标记已存在：即使用户删光也不回填', () => {
    const result = seedBuiltinQuotes([], builtin, true)
    expect(result.quotes).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('非空：只补缺失 id，不覆盖用户数据', () => {
    const custom = { ...quote('custom'), text: '我自己的句子' }
    const result = seedBuiltinQuotes([custom, quote('b1')], builtin, false)
    expect(result.quotes.map(item => item.id)).toEqual(['custom', 'b1', 'b2'])
    expect(result.quotes[0].text).toBe('我自己的句子')
    expect(result.seeded).toBe(true)
  })

  it('重复执行结果稳定', () => {
    const once = seedBuiltinQuotes([], builtin, false)
    const twice = seedBuiltinQuotes(once.quotes, builtin, once.seeded)
    expect(twice.quotes).toEqual(once.quotes)
    expect(twice.changed).toBe(false)
  })
})
