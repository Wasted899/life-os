import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import type { CalendarIndex } from '../model/calendarIndex'
import { getDayBucket } from '../model/calendarIndex'
import { hourLabel, weekdayLabel } from '../calendarViewData'
import DayColumn from './DayColumn'

const HOURS = 24
const HOUR_HEIGHT = 52
const GUTTER = 46

interface TimeGridProps {
  dates: string[]
  index: CalendarIndex
  today: string
  now: Date
  hourHeight?: number
  /** 自定义每日表头；默认显示「M/D 周X」 */
  renderDayHead?: (date: string) => ReactNode
  onOpenBlock: (date: string) => void
  onOpenTodo: (date: string) => void
}

/**
 * 日 / 三日 / 周共用的时间轴：
 * - 左侧 24 小时刻度，各列共享同一垂直滚动容器
 * - 首次挂载或日期范围变化时滚动到当前时间（非今天则滚到 08:00）
 */
export default function TimeGrid({
  dates,
  index,
  today,
  now,
  hourHeight = HOUR_HEIGHT,
  renderDayHead,
  onOpenBlock,
  onOpenTodo,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const datesKey = dates.join(',')
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const focusMinutes = dates.includes(today) ? nowMinutes : 8 * 60
    element.scrollTop = Math.max(0, (focusMinutes / 60) * hourHeight - element.clientHeight / 2)
    // 只在日期范围变化时定位，避免每分钟把用户手动滚动拽回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey, hourHeight])

  const template = `${GUTTER}px repeat(${dates.length}, minmax(0, 1fr))`

  return (
    <div className="cal-timegrid">
      <div className="cal-tg-head" style={{ gridTemplateColumns: template }}>
        <div className="cal-tg-corner" />
        {dates.map(date => (
          <div key={date} className={`cal-tg-dayhead${date === today ? ' is-today' : ''}`}>
            {renderDayHead ? (
              renderDayHead(date)
            ) : (
              <>
                <span className="cal-tg-dayname">{dayjs(date).format('M/D')}</span>
                <span className="cal-tg-weekday">{weekdayLabel(date)}</span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="cal-tg-scroll" ref={scrollRef}>
        <div
          className="cal-tg-body"
          style={{ gridTemplateColumns: template, height: HOURS * hourHeight }}
        >
          <div className="cal-gutter" style={{ height: HOURS * hourHeight }}>
            {Array.from({ length: HOURS }, (_, hour) => (
              <div key={hour} className="cal-gutter-label" style={{ top: hour * hourHeight + 2 }}>
                {hour % 2 === 0 ? hourLabel(hour) : ''}
              </div>
            ))}
          </div>
          {dates.map(date => (
            <DayColumn
              key={date}
              date={date}
              bucket={getDayBucket(index, date)}
              hourHeight={hourHeight}
              isToday={date === today}
              nowMinutes={date === today ? nowMinutes : null}
              onOpenBlock={onOpenBlock}
              onOpenTodo={onOpenTodo}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
