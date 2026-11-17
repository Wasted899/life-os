import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { planRecurringPostings } from './model/recurringRules'
import './finance.css'

/** 进入记账页时由页面派发，用于立即补记一次 */
export const RECURRING_CHECK_EVENT = 'finance:recurring-check'

/**
 * 周期账单自动生成调度层。
 * 只做三件事：判断是否就绪、调用纯函数计划器、通过 addTransaction 写入。
 * 触发点：应用挂载 / 回到前台 / 进入记账页（自定义事件）。
 */
export default function RecurringAutoPost() {
  const { loading: authLoading } = useAuth()
  const { recurrings, transactions, accounts, addTransaction, updateRecurring, cloudLoading, uploading, cloud } = useData()
  const [toast, setToast] = useState('')
  const lastSignatureRef = useRef('')
  const busyRef = useRef(false)

  const ready = !authLoading && !cloudLoading && cloud.phase === 'idle' && !uploading

  const run = useCallback(() => {
    if (!ready || busyRef.current) return
    const today = dayjs().format('YYYY-MM-DD')
    const signature = [
      today,
      recurrings
        .map((item) => [
          item.id,
          item.name,
          item.amount,
          item.cycle,
          item.day,
          item.category,
          item.account,
          item.account_id,
          item.start_date,
          item.next_date,
          item.custom_period,
          item.type,
          item.paused ? '1' : '0',
        ].join('~'))
        .join('|'),
      transactions.map((item) => item.id).join(','),
      accounts.map((item) => `${item.id}:${item.name}`).join(','),
    ].join('#')
    // 同一份数据只处理一次：避免每次渲染都重算，也避免 StrictMode 下重复写入
    if (signature === lastSignatureRef.current) return
    lastSignatureRef.current = signature

    busyRef.current = true
    try {
      const plan = planRecurringPostings({ recurrings, transactions, accounts, today })
      plan.creates.forEach((item) => addTransaction(item))
      plan.nextDates.forEach((item) => updateRecurring(item.id, { next_date: item.next_date }))
      // 一次补记多笔时给出条数提示，单笔到期保持安静
      if (plan.creates.length > 1) setToast(`已自动生成 ${plan.creates.length} 笔周期账单`)
    } finally {
      busyRef.current = false
    }
  }, [ready, recurrings, transactions, accounts, addTransaction, updateRecurring])

  useEffect(() => {
    run()
  }, [run])

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    const handleCheck = () => run()
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener(RECURRING_CHECK_EVENT, handleCheck)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener(RECURRING_CHECK_EVENT, handleCheck)
    }
  }, [run])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  if (!toast) return null
  return <div className="fin-toast">{toast}</div>
}
