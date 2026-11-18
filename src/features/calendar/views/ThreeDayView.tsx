import dayjs from 'dayjs'
import type { CalendarIndex } from '../model/calendarIndex'
import { threeDays } from '../model/calendarRange'
import { weekdayLabel } from '../calendarViewData'
import TimeGrid from '../components/TimeGrid'

interface ThreeDayViewProps {
  anchor: string
  index: CalendarIndex
  today: string
  now: Date
  onOpenBlock: (date: string) => void
  onOpenTodo: (date: string) => void
}

export default function ThreeDayView({
  anchor,
  index,
  today,
  now,
  onOpenBlock,
  onOpenTodo,
}: ThreeDayViewProps) {
  return (
    <TimeGrid
      dates={threeDays(anchor)}
      index={index}
      today={today}
      now={now}
      onOpenBlock={onOpenBlock}
      onOpenTodo={onOpenTodo}
      renderDayHead={date => (
        <>
          <span className="cal-tg-dayname">{dayjs(date).format('M/D')}</span>
          <span className="cal-tg-weekday">{weekdayLabel(date)}</span>
        </>
      )}
    />
  )
}
