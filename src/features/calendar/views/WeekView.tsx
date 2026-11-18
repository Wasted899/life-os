import dayjs from 'dayjs'
import type { CalendarIndex } from '../model/calendarIndex'
import { getDayBucket } from '../model/calendarIndex'
import { weekDays } from '../model/calendarRange'
import { buildDayEntries, untimedTodos, weekdayLabel } from '../calendarViewData'
import TimeGrid from '../components/TimeGrid'

interface WeekViewProps {
  anchor: string
  index: CalendarIndex
  today: string
  now: Date
  onOpenBlock: (date: string) => void
  onOpenTodo: (date: string) => void
}

export default function WeekView({ anchor, index, today, now, onOpenBlock, onOpenTodo }: WeekViewProps) {
  const dates = weekDays(anchor)

  return (
    <>
      <div className="cal-week-grid">
        <TimeGrid
          dates={dates}
          index={index}
          today={today}
          now={now}
          onOpenBlock={onOpenBlock}
          onOpenTodo={onOpenTodo}
          renderDayHead={date => {
            const pending = untimedTodos(getDayBucket(index, date)).length
            return (
              <>
                <span className="cal-tg-dayname">{dayjs(date).format('M/D')}</span>
                <span className="cal-tg-weekday">{weekdayLabel(date)}</span>
                {pending > 0 && (
                  <button
                    type="button"
                    className="cal-untimed"
                    title="当天无具体时间的任务"
                    onClick={() => onOpenTodo(date)}
                  >
                    {pending} 条未排期
                  </button>
                )}
              </>
            )
          }}
        />
      </div>

      {/* 窄屏降级：每天一段卡片列表，避免 7 列时间轴横向挤压 */}
      <div className="cal-week-list">
        {dates.map(date => {
          const bucket = getDayBucket(index, date)
          const entries = buildDayEntries(bucket)
          const pending = untimedTodos(bucket).length
          return (
            <div key={date} className={`cal-week-card${date === today ? ' is-today' : ''}`}>
              <div className="cal-week-card-head">
                <span>
                  {dayjs(date).format('M月D日')} {weekdayLabel(date)}
                </span>
                {pending > 0 && <span className="cal-week-card-pending">{pending} 条未排期</span>}
              </div>
              {entries.length === 0 ? (
                <div className="cal-week-empty">无安排</div>
              ) : (
                entries.map(entry => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`cal-week-item${entry.completed ? ' is-done' : ''}`}
                    onClick={() => (entry.kind === 'block' ? onOpenBlock(date) : onOpenTodo(date))}
                  >
                    <span className="cal-entry-dot" style={{ background: entry.color }} />
                    <span className="cal-week-item-time">{entry.timeLabel || '未排期'}</span>
                    <span className="cal-week-item-title">{entry.title}</span>
                  </button>
                ))
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
