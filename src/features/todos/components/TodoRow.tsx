import type {Todo} from '../../../core/types'
import {QUADRANT_META} from '../types'

type Props = {
  todo: Todo
  batchMode: boolean
  selected: boolean
  listName?: string
  categoryName?: string
  onToggleSelect: (id: string) => void
  onToggleComplete: (todo: Todo) => void
  onTogglePin: (id: string) => void
  onDelete: (id: string) => void
}

const quadrantMeta = (todo: Todo) => QUADRANT_META.find(item => item.id === todo.quadrant) || QUADRANT_META[3]

/** 单行只负责展示 + 抛事件；不读 localStorage、不碰云端、不判断筛选 */
export default function TodoRow({
  todo,
  batchMode,
  selected,
  listName,
  categoryName,
  onToggleSelect,
  onToggleComplete,
  onTogglePin,
  onDelete,
}: Props) {
  const meta = quadrantMeta(todo)
  return (
    <div
      onClick={batchMode ? () => onToggleSelect(todo.id) : undefined}
      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid #f1f5f9',opacity:todo.completed ? 0.5 : 1,cursor:batchMode ? 'pointer' : undefined}}
    >
      {batchMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(todo.id)}
          onClick={e => e.stopPropagation()}
          aria-label={`选择 ${todo.title}`}
        />
      )}
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggleComplete(todo)}
        onClick={e => e.stopPropagation()}
        aria-label={`完成 ${todo.title}`}
      />
      {todo.pinned && <span title="已置顶">📌</span>}
      <span style={{flex:1,textDecoration:todo.completed ? 'line-through' : 'none'}}>
        {todo.title}
        {todo.due_time && <span style={{fontSize:11,color:'#94a3b8',marginLeft:6}}>{todo.due_time}</span>}
      </span>
      {listName && <span className="tag" style={{background:'#e0e7ff',color:'#3730a3'}}>{listName}</span>}
      <span className="tag" style={{background:meta.color + '22',color:meta.color}}>{meta.name}</span>
      {categoryName && <span className="tag" style={{background:'#dbeafe',color:'#1e40af'}}>{categoryName}</span>}
      {todo.source === 'habit' && <span className="tag" style={{background:'#fef3c7',color:'#92400e'}}>习惯</span>}
      {!batchMode && (
        <>
          <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={e => {e.stopPropagation();onTogglePin(todo.id)}}>{todo.pinned ? '取消置顶' : '置顶'}</button>
          <button className="btn btn-ghost" style={{padding:'4px 8px',color:'#ef4444'}} onClick={e => {e.stopPropagation();onDelete(todo.id)}}>删</button>
        </>
      )}
    </div>
  )
}
