import dayjs from 'dayjs'
import type { CalendarIndex } from '../model/calendarIndex'
import { getDayBucket } from '../model/calendarIndex'
import { monthGrid } from '../model/calendarRange'
import { buildDayEntries } from '../calendarViewData'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
/** 桌面最多显示 3 条；移动端显示 4 个色点（纯 CSS 切换，不做高度测量） */
const MAX_DESKTOP = 3
const MAX_MOBILE = 4
const MAX_RENDER = Math.max(MAX_DESKTOP, MAX_MOBILE)

interface MonthViewProps {
  anchor: string
  index: CalendarIndex
  today: string
  onSelectDate: (date: string) => void
  onOpenBlock: (date: string) => void
  onOpenTodo: (date: string) => void
}

export default function MonthView({
  anchor,
  index,
  today,
  onSelectDate,
  onOpenBlock,
  onOpenTodo,
}: MonthViewProps) {
  const grid = monthGrid(anchor)

  return (
    <div className="cal-month">
      <div className="cal-month-weekdays">
        {WEEKDAYS.map(name => (
          <div key={name}>{name}</div>
        ))}
      </div>

      <div className="cal-month-grid">
        {grid.days.map(date => {
          const inMonth = date.startsWith(grid.monthKey)
          const entries = buildDayEntries(getDayBucket(index, date))
          const total = entries.length
          return (
            <div
              key={date}
              className={`cal-month-cell${inMonth ? '' : ' is-outside'}${
                date === today ? ' is-today' : ''
              }`}
            >
              <button
                type="button"
                className="cal-month-date"
                title={dayjs(date).format('YYYY年M月D日')}
                onClick={() => onSelectDate(date)}
              >
                {dayjs(date).date()}
              </button>

              <div className="cal-month-entries">
                {entries.slice(0, MAX_RENDER).map(entry => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`cal-entry${entry.completed ? ' is-done' : ''}`}
                    title={`${entry.timeLabel ? `${entry.timeLabel} ` : ''}${entry.title}`}
                    onClick={() =>
                      entry.kind === 'block' ? onOpenBlock(date) : onOpenTodo(date)
                    }
                  >
                    <span className="cal-entry-dot" style={{ background: entry.color }} />
                    {entry.timeLabel && <span className="cal-entry-time">{entry.timeLabel}</span>}
                    <span className="cal-entry-title">{entry.title}</span>
                  </button>
                ))}
              </div>

              {total > MAX_DESKTOP && (
                <div className="cal-more cal-more--wide">还有 {total - MAX_DESKTOP} 条</div>
              )}
              {total > MAX_MOBILE && (
                <div className="cal-more cal-more--narrow">还有 {total - MAX_MOBILE} 条</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
