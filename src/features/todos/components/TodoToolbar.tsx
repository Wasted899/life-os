import type {ReactNode} from 'react'
import dayjs from 'dayjs'
import type {TodoGroupBy,TodoViewMode} from '../types'

const GROUPS: {id: TodoGroupBy; label: string}[] = [
  {id: 'status', label: '按状态'},
  {id: 'list', label: '按清单'},
  {id: 'category', label: '按分类'},
  {id: 'none', label: '不分组'},
]

const VIEWS: {id: TodoViewMode; label: string}[] = [
  {id: 'list', label: '列表'},
  {id: 'board', label: '看板'},
]

type Props = {
  date: string
  onDateChange: (date: string) => void
  view: TodoViewMode
  onViewChange: (view: TodoViewMode) => void
  groupBy: TodoGroupBy
  onGroupByChange: (group: TodoGroupBy) => void
  batchMode: boolean
  onToggleBatch: () => void
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onAdd: () => void
  batchActions?: ReactNode
}

const shiftDate = (date: string, days: number) => dayjs(date).add(days, 'day').format('YYYY-MM-DD')

/** 工具栏只发事件，不持有状态：日期/视图/分组/批量全部由 TodosPage 管理 */
export default function TodoToolbar({
  date,
  onDateChange,
  view,
  onViewChange,
  groupBy,
  onGroupByChange,
  batchMode,
  onToggleBatch,
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onAdd,
  batchActions,
}: Props) {
  return (
    <>
      <div className="card-title" style={{flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <input type="date" className="input" style={{width:150}} value={date} onChange={e => onDateChange(e.target.value)}/>
          <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={() => onDateChange(shiftDate(date, -1))}>前一天</button>
          <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={() => onDateChange(dayjs().format('YYYY-MM-DD'))}>今天</button>
          <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={() => onDateChange(shiftDate(date, 1))}>后一天</button>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <select className="select" style={{width:110}} value={groupBy} onChange={e => onGroupByChange(e.target.value as TodoGroupBy)}>
            {GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select>
          {VIEWS.map(item => (
            <button key={item.id} className={`btn ${view === item.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => onViewChange(item.id)}>{item.label}</button>
          ))}
          <button className="btn btn-outline" onClick={onToggleBatch}>{batchMode ? '取消批量' : '批量'}</button>
          <button className="btn btn-primary" onClick={onAdd}>+ 添加</button>
        </div>
      </div>
      {batchMode && (
        <div style={{marginBottom:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:13,color:'#475569'}}>已选 {selectedCount} / {totalCount} 项</span>
          <button className="btn btn-ghost" style={{padding:'4px 8px',fontSize:12}} onClick={onSelectAll}>全选当前筛选</button>
          <button className="btn btn-ghost" style={{padding:'4px 8px',fontSize:12}} onClick={onClearSelection}>清空选择</button>
          {batchActions}
        </div>
      )}
    </>
  )
}
