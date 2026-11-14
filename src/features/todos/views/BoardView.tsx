import {useMemo} from 'react'
import type {Category,Quadrant,Todo,TodoList} from '../../../core/types'
import {QUADRANT_META} from '../types'
import {buildQuadrantColumns} from '../hooks/useTodosViewData'

type Props = {
  items: Todo[]
  lists: TodoList[]
  categories: Category[]
  /** 只允许走 updateTodo(todo.id, {quadrant: next}) */
  onMoveQuadrant: (todo: Todo, next: Quadrant) => void
}

/**
 * 看板视图（M1-10）：按 quadrant 固定四列。
 * 不引入拖拽依赖，点击卡片轮转到下一象限（q1→q2→q3→q4→q1）。
 */
export default function BoardView({items, lists, categories, onMoveQuadrant}: Props) {
  const columns = useMemo(() => buildQuadrantColumns(items), [items])
  const listNames = useMemo(() => new Map(lists.map(list => [list.id, list.name])), [lists])
  const categoryNames = useMemo(() => new Map(categories.map(category => [category.id, category.name])), [categories])

  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:12,alignItems:'start'}}>
      {columns.map((column, index) => {
        const meta = QUADRANT_META[index]
        const next = QUADRANT_META[(index + 1) % QUADRANT_META.length]
        return (
          <div
            key={column.id}
            style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:10,minHeight:180}}
          >
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
              <span style={{width:10,height:10,borderRadius:'50%',background:meta.color}}/>
              <span style={{fontWeight:700,fontSize:13,color:meta.color,flex:1}}>{meta.name}</span>
              <span style={{fontSize:11,color:'#94a3b8'}}>{column.items.length}</span>
            </div>

            {column.items.length === 0 && (
              <div style={{border:'1px dashed #cbd5e1',borderRadius:8,padding:'16px 8px',textAlign:'center',fontSize:11,color:'#94a3b8'}}>
                暂无任务
              </div>
            )}

            {column.items.map(todo => (
              <div
                key={todo.id}
                role="button"
                tabIndex={0}
                className="card"
                title={`点击移动到「${next.name}」`}
                aria-label={`${todo.title}，点击移动到${next.name}`}
                onClick={() => onMoveQuadrant(todo, next.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onMoveQuadrant(todo, next.id)
                  }
                }}
                style={{padding:10,marginBottom:8,border:'1px solid #e2e8f0',boxShadow:'none',cursor:'pointer',opacity:todo.completed ? 0.55 : 1}}
              >
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{flex:1,fontSize:13,fontWeight:600,textDecoration:todo.completed ? 'line-through' : 'none'}}>{todo.title}</span>
                  {todo.pinned && <span title="已置顶">📌</span>}
                </div>
                {todo.due_time && <div style={{fontSize:11,color:'#64748b',marginTop:4}}>🕒 {todo.due_time}</div>}
                <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:6}}>
                  {listNames.get(todo.list_id) && (
                    <span className="tag" style={{background:'#e0e7ff',color:'#3730a3'}}>{listNames.get(todo.list_id)}</span>
                  )}
                  {todo.category_id && categoryNames.get(todo.category_id) && (
                    <span className="tag" style={{background:'#dbeafe',color:'#1e40af'}}>{categoryNames.get(todo.category_id)}</span>
                  )}
                </div>
                <div style={{fontSize:10,color:'#94a3b8',marginTop:6}}>点击 → {next.name}</div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
