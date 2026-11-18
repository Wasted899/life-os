import type { DayBucket } from '../model/calendarIndex'
import { layoutDayBlocks } from '../model/calendarLayout'
import { blockColor, blockTimeLabel, formatHourValue, timedTodos } from '../calendarViewData'

const HOURS = 24

interface DayColumnProps {
  date: string
  bucket: DayBucket
  hourHeight: number
  isToday: boolean
  nowMinutes: number | null
  onOpenBlock: (date: string) => void
  onOpenTodo: (date: string) => void
}

/** 单日 24 小时时间轴：时间块用绝对定位，待办用时间点标记 */
export default function DayColumn({
  date,
  bucket,
  hourHeight,
  isToday,
  nowMinutes,
  onOpenBlock,
  onOpenTodo,
}: DayColumnProps) {
  const placed = layoutDayBlocks(bucket.blocks, hourHeight)
  const todos = timedTodos(bucket)

  return (
    <div className="cal-col" style={{ height: HOURS * hourHeight }}>
      {Array.from({ length: HOURS }, (_, hour) => (
        <div key={hour} className="cal-hour" style={{ top: hour * hourHeight }} />
      ))}

      {placed.map(item => (
        <button
          key={item.block.id}
          type="button"
          className={`cal-block${item.abnormal ? ' is-abnormal' : ''}`}
          style={{
            top: item.top,
            height: item.height,
            left: `calc(${item.leftPct}% + 1px)`,
            width: `calc(${item.widthPct}% - 2px)`,
            ...(item.abnormal
              ? {}
              : {
                  background: `${blockColor(item.block.category)}22`,
                  borderLeft: `3px solid ${blockColor(item.block.category)}`,
                }),
          }}
          title={
            item.abnormal
              ? `${item.block.title}（${blockTimeLabel(item.block)}，时间数据异常，点击到时间统计修正）`
              : `${item.block.title}（${blockTimeLabel(item.block)}）`
          }
          onClick={() => onOpenBlock(date)}
        >
          <span className="cal-block-time">
            {formatHourValue(item.block.start)}–{formatHourValue(item.block.end)}
          </span>
          <span className="cal-block-title">{item.block.title}</span>
          {item.abnormal && <span className="cal-block-flag">⚠</span>}
        </button>
      ))}

      {todos.map(item => (
        <button
          key={item.todo.id}
          type="button"
          className="cal-todo-pin"
          style={{ top: (item.minutes / 60) * hourHeight, borderLeftColor: '#2563eb' }}
          title={`${item.todo.title}（${item.time}）`}
          onClick={() => onOpenTodo(date)}
        >
          {item.time} {item.todo.title}
        </button>
      ))}

      {isToday && nowMinutes !== null && (
        <div className="cal-now" style={{ top: (nowMinutes / 60) * hourHeight }} />
      )}
    </div>
  )
}
