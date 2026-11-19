import { describe, expect, it } from 'vitest'
import { sanitizeExternalUrl } from '../../../lib/externalUrl'
import {
  buildGuideFromDraft,
  categoryOf,
  draftFromGuide,
  emptyGuideDraft,
  guideDomains,
  guideIntro,
  guidePrimaryLink,
  normalizeGuideEntry,
} from './guideSchema'

describe('sanitizeExternalUrl', () => {
  it('只放行 http/https 绝对地址', () => {
    expect(sanitizeExternalUrl('https://yz.chsi.com.cn/')).toBe('https://yz.chsi.com.cn/')
    expect(sanitizeExternalUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
  })

  it('剔除 javascript: / data: / 相对路径 / 空值', () => {
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeExternalUrl('data:text/html,hi')).toBeNull()
    expect(sanitizeExternalUrl('/guide/baoyan')).toBeNull()
    expect(sanitizeExternalUrl('www.chsi.com.cn')).toBeNull()
    expect(sanitizeExternalUrl('')).toBeNull()
    expect(sanitizeExternalUrl(null)).toBeNull()
  })
})

describe('guideSchema 归一与派生', () => {
  it('旧分类不改写，展示层归入 other', () => {
    expect(categoryOf({ category: 'kaoyan' })).toBe('kaoyan')
    expect(categoryOf({ category: 'tips' })).toBe('other')
    expect(categoryOf({ category: 'contest' })).toBe('other')
  })

  it('归一丢弃非法链接，缺 id 时用分类+标题生成稳定 id', () => {
    const entry = normalizeGuideEntry({
      category: 'baoyan',
      title: '示例',
      body: ['简介'],
      links: [
        { label: '官网', url: 'https://example.com/' },
        { label: '坏链', url: 'javascript:alert(1)' },
        { label: '相对', url: '/tmp' },
      ],
    })
    expect(entry?.id).toBe('baoyan:示例')
    expect(entry?.links).toEqual([{ label: '官网', url: 'https://example.com/' }])
    expect(entry?.body).toEqual(['简介'])
  })

  it('无标题的条目直接丢弃', () => {
    expect(normalizeGuideEntry({ body: ['x'] })).toBeNull()
    expect(normalizeGuideEntry('not-object')).toBeNull()
  })

  it('主链接取第一条合法外链，域名去重保序', () => {
    const entry = normalizeGuideEntry({
      id: 'a',
      category: 'intern',
      title: '求职',
      links: [
        { label: 'B站', url: 'https://www.bilibili.com/video/1' },
        { label: 'B站2', url: 'https://bilibili.com/video/2' },
        { label: '知乎', url: 'https://www.zhihu.com/' },
      ],
    })
    expect(guidePrimaryLink(entry!)?.url).toBe('https://www.bilibili.com/video/1')
    expect(guideDomains(entry!)).toEqual(['bilibili.com', 'zhihu.com'])
  })

  it('多段正文压成一段可展示简介', () => {
    expect(guideIntro({ body: ['第一行', ' ', '第二行'] })).toBe('第一行 第二行')
  })
})

describe('buildGuideFromDraft', () => {
  it('标题必填；链接名称与地址必须成对出现', () => {
    const empty = emptyGuideDraft('kaoyan')
    expect(buildGuideFromDraft(empty, 'g1').error).toBe('请填写标题')

    const missingUrl = { ...empty, title: '研招网', links: [{ label: '官网', url: '' }] }
    expect(buildGuideFromDraft(missingUrl, 'g1').error).toContain('名称和地址')
  })

  it('非法链接阻止保存，合法链接归一后落库', () => {
    const draft = {
      ...emptyGuideDraft('kaoyan'),
      title: '研招网',
      intro: '第一行\n第二行',
      links: [{ label: '官网', url: 'https://yz.chsi.com.cn/' }],
    }
    const bad = buildGuideFromDraft({ ...draft, links: [{ label: '坏链', url: 'javascript:alert(1)' }] }, 'g1')
    expect(bad.entry).toBeNull()
    expect(bad.error).toContain('http/https')

    const ok = buildGuideFromDraft(draft, 'g1')
    expect(ok.error).toBe('')
    expect(ok.entry).toEqual({
      id: 'g1',
      category: 'kaoyan',
      title: '研招网',
      body: ['第一行', '第二行'],
      links: [{ label: '官网', url: 'https://yz.chsi.com.cn/' }],
    })
  })

  it('编辑旧分类条目时保留原 category，除非用户主动改', () => {
    const draft = draftFromGuide({ id: 'old', category: 'tips', title: '旧条目', body: ['x'] })
    expect(buildGuideFromDraft(draft, 'old').entry?.category).toBe('tips')
  })
})
