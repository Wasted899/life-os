import { describe, expect, it } from 'vitest'
import { readDateParam } from './dateParam'

describe('readDateParam：跨页日期预选', () => {
  it('合法日期原样返回', () => {
    expect(readDateParam('2026-11-18')).toBe('2026-11-18')
    expect(readDateParam('2028-02-29')).toBe('2028-02-29')
  })

  it('缺失或空值返回 null，由调用方回落今天', () => {
    expect(readDateParam(null)).toBeNull()
    expect(readDateParam(undefined)).toBeNull()
    expect(readDateParam('')).toBeNull()
  })

  it('格式不合法返回 null，不抛错', () => {
    expect(readDateParam('2026-2-3')).toBeNull()
    expect(readDateParam(' 2026-11-18')).toBeNull()
    expect(readDateParam('2026/11/18')).toBeNull()
    expect(readDateParam('abc')).toBeNull()
  })

  it('越界日期返回 null：13 月、非闰年 2-29、2-30', () => {
    expect(readDateParam('2026-13-01')).toBeNull()
    expect(readDateParam('2026-00-10')).toBeNull()
    expect(readDateParam('2026-02-29')).toBeNull()
    expect(readDateParam('2026-02-30')).toBeNull()
    expect(readDateParam('2026-04-31')).toBeNull()
  })
})
