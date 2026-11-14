import type {Quadrant,Todo} from '../../../core/types'
import {QUADRANT_META} from '../types'

type Props = {
  items: Todo[]
  onCycleQuadrant: (todo: Todo, next: Quadrant) => void
}

/** 旧四象限看板原样迁入（M1-10 重写）：点击卡片轮转 quadrant */
export default function BoardView({items, onCycleQuadrant}: Props) {
  const undone = items.filter(todo => !todo.completed)
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
      {QUADRANT_META.map(quadrant => {
        const columnTodos = undone.filter(todo => todo.quadrant === quadrant.id)
        return (
          <div key={quadrant.id} className="card" style={{background:'#f8fafc',margin:0}}>
            <div style={{fontWeight:700,marginBottom:12,color:quadrant.color}}>{quadrant.name} ({columnTodos.length})</div>
            {columnTodos.map(todo => (
              <div
                key={todo.id}
                className="card"
                style={{padding:10,marginBottom:8,cursor:'pointer'}}
                onClick={() => {
                  const index = QUADRANT_META.findIndex(item => item.id === todo.quadrant)
                  onCycleQuadrant(todo, QUADRANT_META[(index + 1) % QUADRANT_META.length].id)
                }}
              >
                <div style={{fontSize:14}}>{todo.title}</div>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{todo.source === 'habit' ? '习惯' : '普通'}</div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
