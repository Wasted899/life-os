import type { GuideEntry } from '../../../core/types'
import { load, save } from '../../../core/storage'
import { BUILTIN_GUIDES } from '../builtinGuides'
import { normalizeGuideEntry } from './guideSchema'

/** 唯一真源；沿用 planner:p_guides 信封，与 DataContext 的导入/导出共用 */
export const GUIDES_KEY = 'p_guides'
/** 播种标记：只初始化一次，用户删除示例后不再重灌 */
export const GUIDES_SEEDED_KEY = 'p_guides_seeded'
export const GUIDES_SEED_VERSION = 'v1'

const cloneBuiltin = (): GuideEntry[] =>
  BUILTIN_GUIDES.map(item => ({
    ...item,
    body: [...item.body],
    ...(item.links ? { links: item.links.map(link => ({ ...link })) } : {}),
  }))

const readList = (): GuideEntry[] => {
  const raw = load<unknown>(GUIDES_KEY, null)
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: GuideEntry[] = []
  for (const item of raw) {
    const entry = normalizeGuideEntry(item)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    list.push(entry)
  }
  return list
}

/**
 * 读取指南列表并完成一次性初始化：
 * - 已有用户数据（旧版本导入或手动写入）原样保留，不注入示例、不改写分类；
 * - 空库才播种少量官方示例；
 * - 标记写入后永不再灌，用户删除示例也保持删除状态。
 */
export function readStoredGuides(): GuideEntry[] {
  const list = readList()
  if (load<string>(GUIDES_SEEDED_KEY, '') === GUIDES_SEED_VERSION) return list

  const next = list.length ? list : cloneBuiltin()
  save(GUIDES_KEY, next)
  save(GUIDES_SEEDED_KEY, GUIDES_SEED_VERSION)
  return next
}

export function writeStoredGuides(guides: GuideEntry[]): void {
  save(GUIDES_KEY, guides)
}

/** 按 id 覆盖或追加；id 由页面保证唯一（新条目用 uid） */
export function upsertGuide(guides: GuideEntry[], entry: GuideEntry): GuideEntry[] {
  const index = guides.findIndex(item => item.id === entry.id)
  if (index < 0) return [...guides, entry]
  const next = guides.slice()
  next[index] = entry
  return next
}

export function removeGuide(guides: GuideEntry[], id: string): GuideEntry[] {
  return guides.filter(item => item.id !== id)
}
