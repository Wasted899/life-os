import { useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { financeSummaryOfDay, type FinanceDaySummary } from './model/selectors'

/**
 * 指定日期的记账只读摘要。
 *
 * 首页与复盘都需要「某一天的收入 / 支出 / 笔数」，但两者都不应直接读记账实体。
 * 记账实体只在 finance 目录内被访问，调用方拿到的已是算好的摘要。
 */
export function useFinanceOfDay(date: string): FinanceDaySummary {
  const { transactions } = useData()
  return useMemo(() => financeSummaryOfDay(transactions, date), [transactions, date])
}
