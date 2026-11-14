/**
 * 每日一句纯逻辑（M1-19）
 *
 * - 无 React / DataContext / storage 依赖，当前日期由参数 dateKey 传入
 * - 同一天同一 scope 稳定；点击“换一条”由 Math.random 决定，并写回记录
 * - 记录只保留当天一条，跨天视为过期并回落到哈希选条
 *
 * TODO（quotes 上云时）：p_quotes 与 p_daily_quote 需连同 ACTIVE_OWNER_KEY 一起做账号命名空间化，
 * 否则 A 账号选中的 quoteId 可能在 B 账号词库中不存在（当前会回落到哈希，不会崩溃）。
 */
import type { Quote } from '../../core/types'

export const DAILY_QUOTE_KEY = 'p_daily_quote'
export const QUOTES_SEEDED_KEY = 'p_quotes_seeded'
export const QUOTES_SEED_VERSION = 'v1'
/** 设备级 UI 偏好，与 p_nick / p_avatar 一致，不跟账号走 */
export const QUOTE_SCOPE = 'local'

export interface DailyQuoteRecord {
  /** YYYY-MM-DD */
  date: string
  quoteId: string
}

/** FNV-1a 32 位，稳定、无依赖 */
export const hashString = (input: string): number => {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 选条前按 id 排序，保证词库顺序变化时同一天仍选同一条 */
export const sortQuoteBank = (quotes: Quote[]): Quote[] => [...quotes].sort((a, b) => a.id.localeCompare(b.id))

export const pickDailyQuote = (quotes: Quote[], dateKey: string, scope: string = QUOTE_SCOPE): Quote | null => {
  if (!quotes.length) return null
  const bank = sortQuoteBank(quotes)
  return bank[hashString(`${dateKey}|${scope}`) % bank.length]
}

/** 换一条：必选到不同 id；词库只有 1 条时原样返回 */
export const pickNextQuote = (quotes: Quote[], currentId: string): Quote | null => {
  if (!quotes.length) return null
  if (quotes.length === 1) return quotes[0]
  const bank = sortQuoteBank(quotes)
  const current = bank.findIndex(quote => quote.id === currentId)
  const offset = Math.floor(Math.random() * (bank.length - 1))
  if (current < 0) return bank[offset]
  return bank[(current + 1 + offset) % bank.length]
}

export const parseDailyQuoteRecord = (raw: unknown): DailyQuoteRecord | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (typeof record.date !== 'string' || typeof record.quoteId !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !record.quoteId) return null
  return { date: record.date, quoteId: record.quoteId }
}

/** 当天的记录优先；记录过期或 id 不存在时回落到哈希选条 */
export const resolveDailyQuote = (
  quotes: Quote[],
  record: DailyQuoteRecord | null,
  dateKey: string,
  scope: string = QUOTE_SCOPE,
): Quote | null => {
  if (!quotes.length) return null
  if (record && record.date === dateKey) {
    const hit = quotes.find(quote => quote.id === record.quoteId)
    if (hit) return hit
  }
  return pickDailyQuote(quotes, dateKey, scope)
}

export interface QuoteSeedResult {
  quotes: Quote[]
  /** 处理后标记应视为已写（首次或已存在都为 true） */
  seeded: boolean
  changed: boolean
}

/**
 * 内置词库灌入（三重保险）：
 * 1. 标记已存在 → 永不再灌（用户删光词库也不回填）
 * 2. 词库为空 → 灌入全部内置条目
 * 3. 词库非空 → 只按 id 补缺失的内置条目，不覆盖用户数据
 */
export const seedBuiltinQuotes = (existing: Quote[], builtin: Quote[], seeded: boolean): QuoteSeedResult => {
  if (seeded) return { quotes: existing, seeded: true, changed: false }
  if (!existing.length) return { quotes: sortQuoteBank(builtin), seeded: true, changed: builtin.length > 0 }
  const ids = new Set(existing.map(quote => quote.id))
  const missing = builtin.filter(quote => !ids.has(quote.id))
  return {
    quotes: missing.length ? [...existing, ...missing] : existing,
    seeded: true,
    changed: missing.length > 0,
  }
}
