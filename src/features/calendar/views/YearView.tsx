import { useMemo } from 'react'
import dayjs from 'dayjs'
import type { CalendarIndex } from '../model/calendarIndex'
import { getDayBucket } from '../model/calendarIndex'
import { yearMonths } from '../model/calendarRange'

/** 热力按条数四档（A6）：0 / 1–2 / 3–5 / 6+ */
const densityClass = (count: number): string => {
  if (count <= 0) return ''
  if (count <= 2) return ' lv1'
  if (count <= 5) return ' lv2'
  return ' lv3'
}

interface YearViewProps {
  anchor: string
  index: CalendarIndex
  today: string
  onPickDay: (date: string) => void
  onPickMonth: (date: string) => void
}

export default function YearView({ anchor, index, today, onPickDay, onPickMonth }: YearViewProps) {
  const year = dayjs(anchor).year()
  const months = useMemo(() => yearMonths(year), [year])

  return (
    <div className="cal-year">
      {months.map(month => {
        const leading = (dayjs(month.days[0]).day() + 6) % 7
        return (
          <div key={month.monthKey} className="cal-year-card">
            <button
              type="button"
              className="cal-year-title"
              onClick={() => onPickMonth(`${month.monthKey}-01`)}
            >
              {month.month} 月
            </button>
            <div className="cal-year-week">
              {Array.from({ length: leading }, (_, index) => (
                <span key={`blank-${index}`} className="cal-year-cell is-blank" />
              ))}
              {month.days.map(date => {
                const count = getDayBucket(index, date).count
                return (
                  <button
                    key={date}
                    type="button"
                    className={`cal-year-cell${densityClass(count)}${
                      date === today ? ' is-today' : ''
                    }`}
                    title={`${dayjs(date).format('M月D日')} · ${count} 条`}
                    onClick={() => onPickDay(date)}
                  >
                    {dayjs(date).date()}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
