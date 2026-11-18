import dayjs from 'dayjs'
import type { CalendarIndex } from '../model/calendarIndex'
import { weekdayLabel } from '../calendarViewData'
import TimeGrid from '../components/TimeGrid'

interface DayViewProps {
  anchor: string
  index: CalendarIndex
  today: string
  now: Date
  onOpenBlock: (date: string) => void
  onOpenTodo: (date: string) => void
}

export default function DayView({ anchor, index, today, now, onOpenBlock, onOpenTodo }: DayViewProps) {
  return (
    <TimeGrid
      dates={[anchor]}
      index={index}
      today={today}
      now={now}
      onOpenBlock={onOpenBlock}
      onOpenTodo={onOpenTodo}
      renderDayHead={date => (
        <>
          <span className="cal-tg-dayname">{dayjs(date).format('M月D日')}</span>
          <span className="cal-tg-weekday">{weekdayLabel(date)}</span>
        </>
      )}
    />
  )
}
