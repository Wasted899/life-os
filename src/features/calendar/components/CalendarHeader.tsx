import dayjs from 'dayjs'
import type { CalendarView } from '../model/calendarRange'
import { CALENDAR_VIEWS, threeDays, weekDays } from '../model/calendarRange'

const VIEW_LABEL: Record<CalendarView, string> = {
  month: '月',
  week: '周',
  three: '三日',
  day: '日',
  year: '年',
}

interface CalendarHeaderProps {
  view: CalendarView
  anchor: string
  onViewChange: (view: CalendarView) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

const rangeTitle = (anchor: string, view: CalendarView): string => {
  const value = dayjs(anchor)
  if (view === 'month') return value.format('YYYY年M月')
  if (view === 'year') return value.format('YYYY年')
  if (view === 'day') return value.format('YYYY年M月D日 dddd')
  if (view === 'week') {
    const days = weekDays(anchor)
    const start = dayjs(days[0])
    const end = dayjs(days[6])
    return start.year() === end.year()
      ? `${start.format('YYYY年M月D日')} – ${end.format('M月D日')}`
      : `${start.format('YYYY年M月D日')} – ${end.format('YYYY年M月D日')}`
  }
  const days = threeDays(anchor)
  const start = dayjs(days[0])
  const end = dayjs(days[2])
  return start.year() === end.year()
    ? `${start.format('YYYY年M月D日')} – ${end.format('M月D日')}`
    : `${start.format('YYYY年M月D日')} – ${end.format('YYYY年M月D日')}`
}

export default function CalendarHeader({
  view,
  anchor,
  onViewChange,
  onPrev,
  onNext,
  onToday,
}: CalendarHeaderProps) {
  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar-left">
        <button type="button" className="cal-nav" onClick={onPrev} aria-label="上一屏">
          ‹
        </button>
        <span className="cal-title">{rangeTitle(anchor, view)}</span>
        <button type="button" className="cal-nav" onClick={onNext} aria-label="下一屏">
          ›
        </button>
        <button type="button" className="cal-nav cal-nav--today" onClick={onToday}>
          今天
        </button>
      </div>
      <div className="cal-views">
        {CALENDAR_VIEWS.map(item => (
          <button
            key={item}
            type="button"
            className={`cal-view-btn${view === item ? ' is-active' : ''}`}
            onClick={() => onViewChange(item)}
          >
            {VIEW_LABEL[item]}
          </button>
        ))}
      </div>
    </div>
  )
}
