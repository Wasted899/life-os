import type {ReactNode} from 'react'
import type {TodoGroupBy,TodoScope,TodoViewMode} from '../types'
import {formatDateLabel,shiftDate,todayISO} from '../date'

const GROUPS: {id: TodoGroupBy; label: string}[] = [
  {id: 'status', label: '按状态'},
  {id: 'list', label: '按清单'},
  {id: 'category', label: '按分类'},
  {id: 'none', label: '不分组'},
]

const VIEWS: {id: TodoViewMode; label: string}[] = [
  {id: 'list', label: '列表'},
  {id: 'board', label: '看板'},
  {id: 'timeline', label: '时间线'},
]

type Props = {
  date: string
  onDateChange: (date: string) => void
  scope: TodoScope
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

/** 工具栏只发事件，不持有状态：日期/视图/分组/批量全部由 TodosPage 管理 */
export default function TodoToolbar({
  date,
  onDateChange,
  scope,
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
      {scope === 'unscheduled' && (
        <div style={{marginBottom:12,padding:'8px 10px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:12,color:'#9a3412'}}>未排期：仅显示没有日期的待办。可在列表中逐条补日期，或进入批量后批量补日期。</span>
          <button className="btn btn-outline" style={{padding:'2px 10px',fontSize:12}} onClick={() => onDateChange(date)}>返回日期视图</button>
        </div>
      )}
      <div className="card-title" style={{flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontWeight:700,fontSize:14,color:'#1e293b'}}>{formatDateLabel(date)}</span>
          <input type="date" className="input" style={{width:150}} value={date} onChange={e => onDateChange(e.target.value)} aria-label="选择日期"/>
          <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={() => onDateChange(shiftDate(date, -1))}>昨日</button>
          <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={() => onDateChange(todayISO())}>今日</button>
          <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={() => onDateChange(shiftDate(date, 1))}>明日</button>
          {date !== todayISO() && (
            <button className="btn btn-primary" style={{padding:'4px 10px'}} onClick={() => onDateChange(todayISO())}>回到今天</button>
          )}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {view === 'list' && (
            <select className="select" style={{width:110}} value={groupBy} onChange={e => onGroupByChange(e.target.value as TodoGroupBy)}>
              {GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
          )}
          {VIEWS.map(item => (
            <button key={item.id} className={`btn ${view === item.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => onViewChange(item.id)}>{item.label}</button>
          ))}
          {view === 'list' && (
            <button className="btn btn-outline" onClick={onToggleBatch}>{batchMode ? '取消批量' : '批量'}</button>
          )}
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
