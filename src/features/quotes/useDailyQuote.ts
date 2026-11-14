/**
 * 每日一句（M1-19）
 *
 * - 只有 useMemo：选条是纯计算，不写存储、不新增 useEffect
 * - 唯一写入发生在“换一条”点击回调：p_daily_quote = { date, quoteId }
 * - p_daily_quote 为设备级 UI 偏好，与 p_nick / p_avatar 一致，不跟账号走
 */
import { useCallback, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useData } from '../../context/DataContext'
import { load, save } from '../../core/storage'
import type { Quote } from '../../core/types'
import {
  DAILY_QUOTE_KEY,
  parseDailyQuoteRecord,
  pickNextQuote,
  resolveDailyQuote,
  type DailyQuoteRecord,
} from './quotes'

export interface DailyQuote {
  quote: Quote | null
  next: () => void
  canNext: boolean
}

export function useDailyQuote(): DailyQuote {
  const { quotes } = useData()
  const today = dayjs().format('YYYY-MM-DD')
  const [record, setRecord] = useState<DailyQuoteRecord | null>(
    () => parseDailyQuoteRecord(load<unknown>(DAILY_QUOTE_KEY, null)),
  )

  const quote = useMemo(
    () => resolveDailyQuote(quotes, record, today),
    [quotes, record, today],
  )

  const next = useCallback(() => {
    const current = resolveDailyQuote(quotes, record, today)
    const picked = pickNextQuote(quotes, current?.id || '')
    if (!picked) return
    const nextRecord: DailyQuoteRecord = { date: today, quoteId: picked.id }
    save(DAILY_QUOTE_KEY, nextRecord)
    setRecord(nextRecord)
  }, [quotes, record, today])

  return { quote, next, canNext: quotes.length > 1 }
}
