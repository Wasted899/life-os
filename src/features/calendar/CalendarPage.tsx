import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { load, save } from '../../core/storage'
import type { CalendarView } from './model/calendarRange'
import { normalizeAnchor, normalizeView, shiftView, todayISO } from './model/calendarRange'
import { buildCalendarIndex } from './model/calendarIndex'
import CalendarHeader from './components/CalendarHeader'
import MonthView from './views/MonthView'
import WeekView from './views/WeekView'
import ThreeDayView from './views/ThreeDayView'
import DayView from './views/DayView'
import YearView from './views/YearView'
import './calendar.css'

const VIEW_PREF_KEY = 'p_calendar_view'

/**
 * 日历五视图。
 *
 * 状态口径：view / date 严格来自 URL query（?view=month&date=2026-11-18），
 * 刷新、前进后退、分享链接都以 URL 为准；localStorage 只在没有 query 时提供默认视图。
 */
export default function CalendarPage() {
  const { todos, timeBlocks } = useData()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const storedView = useMemo(() => normalizeView(load<unknown>(VIEW_PREF_KEY, 'month')), [])
  const view = normalizeView(params.get('view') ?? storedView)
  const anchor = normalizeAnchor(params.get('date'))
  const today = todayISO()

  const index = useMemo(() => buildCalendarIndex(todos, timeBlocks), [todos, timeBlocks])

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const go = (nextView: CalendarView, nextDate: string, replace = false) => {
    const next = new URLSearchParams()
    next.set('view', nextView)
    next.set('date', nextDate)
    setParams(next, { replace })
    if (nextView !== view) save(VIEW_PREF_KEY, nextView)
  }

  const openBlock = (date: string, abnormal = false) =>
    navigate(abnormal ? `/time?date=${date}&abnormal=1` : `/time?date=${date}`)
  const openTodo = (date: string) => navigate(`/todos?date=${date}`)

  return (
    <div className="card cal-page">
      <CalendarHeader
        view={view}
        anchor={anchor}
        onViewChange={next => go(next, anchor)}
        onPrev={() => go(view, shiftView(anchor, view, -1))}
        onNext={() => go(view, shiftView(anchor, view, 1))}
        onToday={() => go(view, today, true)}
      />

      {view === 'month' && (
        <MonthView
          anchor={anchor}
          index={index}
          today={today}
          onSelectDate={date => go('month', date)}
          onOpenBlock={openBlock}
          onOpenTodo={openTodo}
        />
      )}

      {view === 'week' && (
        <WeekView
          anchor={anchor}
          index={index}
          today={today}
          now={now}
          onOpenBlock={openBlock}
          onOpenTodo={openTodo}
        />
      )}

      {view === 'three' && (
        <ThreeDayView
          anchor={anchor}
          index={index}
          today={today}
          now={now}
          onOpenBlock={openBlock}
          onOpenTodo={openTodo}
        />
      )}

      {view === 'day' && (
        <DayView
          anchor={anchor}
          index={index}
          today={today}
          now={now}
          onOpenBlock={openBlock}
          onOpenTodo={openTodo}
        />
      )}

      {view === 'year' && (
        <YearView
          anchor={anchor}
          index={index}
          today={today}
          onPickDay={date => go('day', date)}
          onPickMonth={date => go('month', date)}
        />
      )}
    </div>
  )
}
