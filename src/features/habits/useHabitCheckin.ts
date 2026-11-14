/**
 * 习惯打卡共用逻辑（M1-18）
 *
 * 习惯页与首页「今日」共用同一套语义，避免两处漂移：
 * - 未打卡 → 先弹用时（可留空），确认后写 check_dates
 * - 已打卡 → 直接取消，已写入的时间块保留
 * - 时间块仅在记录用时时新增，取消打卡不回收
 */
import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import { useData } from '../../context/DataContext'
import type { Habit } from '../../core/types'

export interface HabitCheckin {
  /** 非空表示“等待记录用时”的习惯 */
  pendingCheck: Habit | null
  check: (habit: Habit) => void
  finishCheck: (minutes: number | null) => void
  cancelCheck: () => void
}

export function useHabitCheckin(): HabitCheckin {
  const { categories, updateHabit, addTimeBlock } = useData()
  const [pendingCheck, setPendingCheck] = useState<Habit | null>(null)
  const today = dayjs().format('YYYY-MM-DD')

  const check = useCallback((habit: Habit) => {
    if (habit.check_dates.includes(today)) {
      updateHabit(habit.id, { check_dates: habit.check_dates.filter(date => date !== today) })
      return
    }
    setPendingCheck(habit)
  }, [today, updateHabit])

  const cancelCheck = useCallback(() => setPendingCheck(null), [])

  const finishCheck = useCallback((minutes: number | null) => {
    const habit = pendingCheck
    setPendingCheck(null)
    if (!habit) return
    if (minutes !== null) {
      const category = categories.find(item => item.id === habit.category_id)
      const start = dayjs().hour()
      addTimeBlock({
        date: today,
        start,
        end: start + minutes / 60,
        title: habit.title,
        category: category?.name || '学习',
        source: 'habit',
      })
    }
    updateHabit(habit.id, { check_dates: [...habit.check_dates, today] })
  }, [addTimeBlock, categories, pendingCheck, today, updateHabit])

  return { pendingCheck, check, finishCheck, cancelCheck }
}
