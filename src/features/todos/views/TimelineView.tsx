import {useMemo} from 'react'
import type {Category,Todo,TodoList} from '../../../core/types'
import {QUADRANT_META} from '../types'
import {buildTimeline,timeOfValue,timelineTimeOf} from '../hooks/useTodosViewData'

type Props = {
  items: Todo[]
  lists: TodoList[]
  categories: Category[]
}

/**
 * 时间线视图（M1-11，规格 §4.11）：
 * 无具体时间的任务不进时间线；只收 due_time 或 start/end 有值的待办，
 * 按时间升序纵向排列，左侧时间刻度 + 竖线 + 卡片。
 */
export default function TimelineView({items, lists, categories}: Props) {
  const timeline = useMemo(() => buildTimeline(items), [items])
  const listNames = useMemo(() => new Map(lists.map(list => [list.id, list.name])), [lists])
  const categoryNames = useMemo(() => new Map(categories.map(category => [category.id, category.name])), [categories])

  if (timeline.length === 0) {
    return <div className="empty">这一天没有带具体时间的待办</div>
  }

  return (
    <div style={{padding:'4px 0'}}>
      {timeline.map(todo => {
        const meta = QUADRANT_META.find(item => item.id === todo.quadrant) || QUADRANT_META[3]
        const start = timeOfValue(todo.start)
        const end = timeOfValue(todo.end)
        const range = start && end ? `${start} – ${end}` : start ? `${start} 起` : ''
        return (
          <div key={todo.id} style={{display:'flex',alignItems:'stretch',gap:10}}>
            <div style={{width:52,flexShrink:0,textAlign:'right',fontSize:12,color:'#475569',fontVariantNumeric:'tabular-nums',paddingTop:12}}>
              {timelineTimeOf(todo)}
            </div>

            <div style={{position:'relative',width:14,flexShrink:0}}>
              <div style={{position:'absolute',top:0,bottom:0,left:6,width:2,background:'#e2e8f0'}}/>
              <div
                style={{
                  position:'absolute',
                  top:16,
                  left:2,
                  width:10,
                  height:10,
                  borderRadius:'50%',
                  background:meta.color,
                  border:'2px solid #fff',
                  boxShadow:`0 0 0 2px ${meta.color}33`,
                }}
              />
            </div>

            <div style={{flex:1,paddingBottom:12}}>
              <div className="card" style={{padding:10,margin:0,border:'1px solid #e2e8f0',boxShadow:'none',opacity:todo.completed ? 0.55 : 1}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{flex:1,fontSize:14,fontWeight:600,textDecoration:todo.completed ? 'line-through' : 'none'}}>
                    {todo.title}
                  </span>
                  {todo.pinned && <span title="已置顶">📌</span>}
                  {range && <span style={{fontSize:11,color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{range}</span>}
                </div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
                  <span className="tag" style={{background:meta.color + '22',color:meta.color}}>{meta.name}</span>
                  {listNames.get(todo.list_id) && (
                    <span className="tag" style={{background:'#e0e7ff',color:'#3730a3'}}>{listNames.get(todo.list_id)}</span>
                  )}
                  {todo.category_id && categoryNames.get(todo.category_id) && (
                    <span className="tag" style={{background:'#dbeafe',color:'#1e40af'}}>{categoryNames.get(todo.category_id)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
