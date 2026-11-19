import type { GuideEntry, GuideLink } from '../../../core/types'
import { externalDomain, sanitizeExternalUrl } from '../../../lib/externalUrl'

/** 左侧四个主分类；旧数据里出现过的其它 category 统一归入「其他」，但不改写原值 */
export interface GuideCategory {
  id: string
  label: string
  icon: string
  hint: string
}

export const GUIDE_CATEGORIES: readonly GuideCategory[] = [
  { id: 'baoyan', label: '保研', icon: '🎓', hint: '推免政策、夏令营与院校信息入口' },
  { id: 'intern', label: '实习', icon: '💼', hint: '校招、实习岗位与求职资源' },
  { id: 'kaoyan', label: '考研', icon: '📚', hint: '报名、备考与院校专业查询' },
  { id: 'scholarship', label: '奖学金', icon: '🏅', hint: '奖助学金政策与申请入口' },
]

export const GUIDE_CATEGORY_IDS: readonly string[] = GUIDE_CATEGORIES.map(item => item.id)

export const OTHER_CATEGORY = 'other'

export const isGuideCategory = (value: unknown): boolean =>
  typeof value === 'string' && GUIDE_CATEGORY_IDS.includes(value)

/** 展示分组：四类之外一律落到「其他」，只影响展示，不修改条目的 category */
export const categoryOf = (entry: Pick<GuideEntry, 'category'>): string =>
  isGuideCategory(entry.category) ? entry.category : OTHER_CATEGORY

export const categoryLabelOf = (id: string): string =>
  GUIDE_CATEGORIES.find(item => item.id === id)?.label ?? '其他'

/** 卡片用简介：把历史多段正文压成一段空格分隔的纯文本 */
export const guideIntro = (entry: Pick<GuideEntry, 'body'>): string =>
  entry.body
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')

/** 主链接：取第一条合法外链，卡片主体点击即打开它 */
export const guidePrimaryLink = (entry: Pick<GuideEntry, 'links'>): GuideLink | null => {
  for (const link of entry.links ?? []) {
    const url = sanitizeExternalUrl(link.url)
    if (url) return { label: link.label.trim() || externalDomain(url), url }
  }
  return null
}

/** 卡片上展示的域名（去重、保序） */
export const guideDomains = (entry: Pick<GuideEntry, 'links'>): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const link of entry.links ?? []) {
    const domain = externalDomain(link.url)
    if (domain && !seen.has(domain)) {
      seen.add(domain)
      result.push(domain)
    }
  }
  return result
}

/** 读取侧归一：丢弃非法链接，保证 UI 拿到的都是安全的 http/https 地址 */
export function normalizeGuideEntry(item: unknown): GuideEntry | null {
  if (!item || typeof item !== 'object') return null
  const source = item as Record<string, unknown>
  const title = typeof source.title === 'string' ? source.title.trim() : ''
  if (!title) return null

  const category = typeof source.category === 'string' && source.category.trim()
    ? source.category.trim()
    : OTHER_CATEGORY
  const links: GuideLink[] = []
  if (Array.isArray(source.links)) {
    for (const rawLink of source.links) {
      if (!rawLink || typeof rawLink !== 'object') continue
      const link = rawLink as Record<string, unknown>
      const label = typeof link.label === 'string' ? link.label.trim() : ''
      const url = sanitizeExternalUrl(link.url)
      if (label && url) links.push({ label, url })
    }
  }

  const entry: GuideEntry = {
    // 旧数据缺 id 时用 category + title 生成稳定兜底，避免每次刷新 key 变化
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `${category}:${title}`,
    category,
    title,
    body: Array.isArray(source.body) ? source.body.filter((line): line is string => typeof line === 'string') : [],
  }
  if (typeof source.icon === 'string' && source.icon.trim()) entry.icon = source.icon.trim()
  if (links.length) entry.links = links
  return entry
}

export interface GuideDraft {
  category: string
  title: string
  icon: string
  intro: string
  links: GuideLink[]
}

export const emptyGuideDraft = (category: string): GuideDraft => ({
  category: isGuideCategory(category) ? category : GUIDE_CATEGORIES[0].id,
  title: '',
  icon: '',
  intro: '',
  links: [],
})

export const draftFromGuide = (entry: GuideEntry): GuideDraft => ({
  category: entry.category,
  title: entry.title,
  icon: entry.icon ?? '',
  intro: entry.body.join('\n'),
  links: (entry.links ?? []).map(link => ({ ...link })),
})

/**
 * 表单 → 实体：标题必填；链接要么整行留空、要么名称和合法地址都齐全。
 * 任一非法地址返回 error，由页面提示后阻止保存（不静默丢弃用户输入）。
 */
export function buildGuideFromDraft(
  draft: GuideDraft,
  id: string,
): { entry: GuideEntry | null; error: string } {
  const title = draft.title.trim()
  if (!title) return { entry: null, error: '请填写标题' }

  const rows = draft.links
    .map(link => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter(link => link.label || link.url)

  const links: GuideLink[] = []
  for (const row of rows) {
    if (!row.label || !row.url) return { entry: null, error: '每条链接都需要填写名称和地址' }
    const url = sanitizeExternalUrl(row.url)
    if (!url) return { entry: null, error: `链接必须是 http/https 绝对地址：${row.url}` }
    links.push({ label: row.label, url })
  }

  const entry: GuideEntry = {
    id,
    category: draft.category || GUIDE_CATEGORIES[0].id,
    title,
    body: draft.intro
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean),
  }
  if (draft.icon.trim()) entry.icon = draft.icon.trim()
  if (links.length) entry.links = links
  return { entry, error: '' }
}
