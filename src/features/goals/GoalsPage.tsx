import {useEffect,useMemo,useState} from 'react'
import {useData} from '../../context/DataContext'
import Modal from '../../core/ui/Modal'
import type {Goal,GoalLevel} from '../../core/types'
import dayjs from 'dayjs'
import GoalNode from './GoalNode'
import {
  childrenOfGoal,
  GOAL_LEVELS,
  goalChildLevel,
  goalLevelLabel,
  goalLevelOf,
  goalParentError,
  goalParentLevel,
  goalPeriodKeyOf,
  legacyTypeOfLevel,
  periodContains,
  periodKeyFor,
  periodLabel,
  shiftPeriodKey,
  buildGoalIndex,
  dateOfPeriodKey,
} from './goalTree'

interface GoalForm{
  mode:'add'|'edit'
  id?:string
  title:string
  level:GoalLevel
  parentId:string
  periodDate:string
  progress:string
  description:string
}

const clampProgress=(value:number):number=>Math.min(100,Math.max(0,Math.round(Number(value)||0)))

export default function Goals(){
  const{goals,addGoal,updateGoal,deleteGoal}=useData()
  const goalIndex=useMemo(()=>buildGoalIndex(goals),[goals])
  const[level,setLevel]=useState<GoalLevel>('year')
  const[anchor,setAnchor]=useState(()=>periodKeyFor('year',dayjs()))
  const[expanded,setExpanded]=useState<Set<string>>(new Set())
  const[form,setForm]=useState<GoalForm|null>(null)
  const[error,setError]=useState('')
  const[notice,setNotice]=useState('')

  const roots=useMemo(
    ()=>goalIndex.byLevel[level].filter(goal=>goalPeriodKeyOf(goal)===anchor),
    [goalIndex,level,anchor],
  )
  const rootIds=roots.map(goal=>goal.id).join('|')

  // 默认展开一层：每次切换层级/周期时，展开有子节点的根目标
  useEffect(()=>{
    setExpanded(new Set(roots.filter(goal=>childrenOfGoal(goalIndex,goal.id).length).map(goal=>goal.id)))
    setNotice('')
  },[level,anchor,rootIds])

  const changeLevel=(next:GoalLevel)=>{
    setLevel(next)
    setAnchor(periodKeyFor(next,dayjs()))
    setError('')
  }
  const toggle=(id:string)=>{
    setExpanded(prev=>{
      const next=new Set(prev)
      if(next.has(id))next.delete(id)
      else next.add(id)
      return next
    })
  }
  const expandAll=()=>{
    const ids=new Set<string>()
    const walk=(goal:Goal)=>{
      if(childrenOfGoal(goalIndex,goal.id).length){
        ids.add(goal.id)
        childrenOfGoal(goalIndex,goal.id).forEach(walk)
      }
    }
    roots.forEach(walk)
    setExpanded(ids)
  }

  const openAdd=(parent?:Goal)=>{
    const nextLevel=parent?goalChildLevel(goalLevelOf(parent)):level
    if(!nextLevel)return
    let periodDate=dateOfPeriodKey(nextLevel,periodKeyFor(nextLevel,dayjs()))
    // 父目标不在当前周期时，子目标默认落在父周期起点，避免一保存就被周期校验拒绝
    if(parent&&!periodContains(goalLevelOf(parent),goalPeriodKeyOf(parent),nextLevel,periodKeyFor(nextLevel,periodDate))){
      periodDate=dateOfPeriodKey(nextLevel,goalPeriodKeyOf(parent))
    }
    setForm({
      mode:'add',
      title:'',
      level:nextLevel,
      parentId:parent?.id || '',
      periodDate,
      progress:'0',
      description:'',
    })
    setError('')
  }
  const openEdit=(goal:Goal)=>{
    const goalLevel=goalLevelOf(goal)
    setForm({
      mode:'edit',
      id:goal.id,
      title:goal.title,
      level:goalLevel,
      parentId:goal.parent_id || '',
      periodDate:dateOfPeriodKey(goalLevel,goalPeriodKeyOf(goal)),
      progress:String(goal.progress||0),
      description:goal.description||'',
    })
    setError('')
  }

  const save=()=>{
    if(!form)return
    const title=form.title.trim()
    if(!title){setError('请输入目标名称');return}
    const periodKey=periodKeyFor(form.level,form.periodDate)
    const parent=form.parentId?goalIndex.byId.get(form.parentId):undefined
    if(parent){
      if(parent.id===form.id){setError('目标不能以自己为父目标');return}
      const message=goalParentError(form.level,periodKey,parent)
      if(message){setError(message);return}
    }

    if(form.mode==='edit'&&form.id){
      const original=goalIndex.byId.get(form.id)
      const children=childrenOfGoal(goalIndex,form.id)
      if(children.length&&original&&goalLevelOf(original)!==form.level){
        setError('该目标已有子目标，请先删除或移出子目标再修改层级')
        return
      }
      if(children.length){
        const outside=children.find(child=>!periodContains(
          form.level,
          periodKey,
          goalLevelOf(child),
          goalPeriodKeyOf(child),
        ))
        if(outside){
          setError(`子目标「${outside.title}」不在新周期内，请先调整子目标周期`)
          return
        }
      }
      const patch:Partial<Goal>={
        title,
        level:form.level,
        type:legacyTypeOfLevel(form.level),
        period_key:periodKey,
        parent_id:parent?.id || '',
        description:form.description,
      }
      // 有子目标时进度由汇总展示，不覆盖存储值
      if(!children.length)patch.progress=clampProgress(Number(form.progress))
      updateGoal(form.id,patch)
    }else{
      addGoal({
        title,
        type:legacyTypeOfLevel(form.level),
        level:form.level,
        period_key:periodKey,
        parent_id:parent?.id || '',
        progress:clampProgress(Number(form.progress)),
        status:'active',
        description:form.description,
      })
    }
    if(parent)setExpanded(prev=>new Set(prev).add(parent.id))
    setForm(null)
    setError('')
  }

  const remove=(goal:Goal)=>{
    const children=childrenOfGoal(goalIndex,goal.id)
    if(children.length){
      setNotice(`「${goal.title}」还有 ${children.length} 个子目标，请先删除或移出子目标`)
      return
    }
    setNotice('')
    deleteGoal(goal.id)
  }

  const bump=(goal:Goal)=>{
    updateGoal(goal.id,{progress:clampProgress((goal.progress||0)+10)})
  }

  const parentLevel=form?goalParentLevel(form.level):null
  const parentOptions=parentLevel
    ? goalIndex.byLevel[parentLevel].filter(goal=>goal.id!==form?.id)
    : []
  const editingHasChildren=form?.mode==='edit'&&form.id
    ?childrenOfGoal(goalIndex,form.id).length>0
    :false

  return(
    <div className="card">
      <div className="card-title" style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {GOAL_LEVELS.map(item=>(
            <button
              key={item}
              className={`btn ${level===item?'btn-primary':'btn-outline'}`}
              onClick={()=>changeLevel(item)}
            >{goalLevelLabel(item)}度目标</button>
          ))}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          <button className="btn btn-ghost" onClick={()=>setAnchor(shiftPeriodKey(level,anchor,-1))}>‹ 上一周期</button>
          <span className="tag" style={{background:'#e0e7ff',color:'#3730a3'}}>{periodLabel(level,anchor)}</span>
          <button className="btn btn-ghost" onClick={()=>setAnchor(shiftPeriodKey(level,anchor,1))}>下一周期 ›</button>
          <button className="btn btn-ghost" onClick={()=>setAnchor(periodKeyFor(level,dayjs()))}>回到今天</button>
          <button className="btn btn-outline" onClick={expandAll}>展开全部</button>
          <button className="btn btn-outline" onClick={()=>setExpanded(new Set())}>收起全部</button>
          <button className="btn btn-primary" onClick={()=>openAdd()}>+ 添加目标</button>
        </div>
      </div>

      {notice&&<div style={{marginBottom:10,padding:'8px 12px',borderRadius:8,background:'#fef2f2',color:'#b91c1c',fontSize:13}}>{notice}</div>}

      {roots.length===0?<div className="empty">当前周期暂无{goalLevelLabel(level)}目标</div>:roots.map(goal=>(
        <GoalNode
          key={goal.id}
          goal={goal}
          depth={0}
          index={goalIndex}
          expanded={expanded}
          onToggle={toggle}
          onEdit={openEdit}
          onDelete={remove}
          onAddChild={openAdd}
          onBump={bump}
        />
      ))}

      <Modal
        open={!!form}
        title={`${form?.mode==='edit'?'编辑':'添加'}目标`}
        onClose={()=>setForm(null)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={()=>setForm(null)}>取消</button>
            <button className="btn btn-primary" onClick={save}>保存</button>
          </>
        }
      >
        {form&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <input
              className="input"
              placeholder="目标名称，如：通过英语六级"
              value={form.title}
              onChange={e=>setForm({...form,title:e.target.value})}
              autoFocus
            />

            <div>
              <label style={{fontSize:13,color:'#64748b'}}>层级</label>
              <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
                {GOAL_LEVELS.map(item=>(
                  <button
                    key={item}
                    className={`btn ${form.level===item?'btn-primary':'btn-outline'}`}
                    style={{padding:'6px 14px',fontSize:13}}
                    onClick={()=>setForm({...form,level:item,parentId:''})}
                  >{goalLevelLabel(item)}目标</button>
                ))}
              </div>
            </div>

            <div>
              <label style={{fontSize:13,color:'#64748b'}}>父目标</label>
              {parentLevel?(
                <select
                  className="select"
                  style={{marginTop:6}}
                  value={form.parentId}
                  onChange={e=>setForm({...form,parentId:e.target.value})}
                >
                  <option value="">无（作为顶层{goalLevelLabel(form.level)}目标）</option>
                  {parentOptions.map(goal=>(
                    <option key={goal.id} value={goal.id}>
                      {goal.title}（{periodLabel(goalLevelOf(goal),goalPeriodKeyOf(goal))}）
                    </option>
                  ))}
                </select>
              ):(
                <div style={{fontSize:12,color:'#94a3b8',marginTop:6}}>年目标是顶层，没有父目标</div>
              )}
            </div>

            <div>
              <label style={{fontSize:13,color:'#64748b'}}>周期（按所选日期归入{goalLevelLabel(form.level)}周期）</label>
              <div style={{display:'flex',gap:8,marginTop:6,alignItems:'center'}}>
                <input
                  className="input"
                  type="date"
                  style={{flex:1}}
                  value={form.periodDate}
                  onChange={e=>setForm({...form,periodDate:e.target.value})}
                />
                <span className="tag" style={{background:'#f1f5f9',color:'#475569'}}>
                  {periodKeyFor(form.level,form.periodDate)}
                </span>
              </div>
            </div>

            <div>
              <label style={{fontSize:13,color:'#64748b'}}>进度</label>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                style={{marginTop:6}}
                value={form.progress}
                disabled={editingHasChildren}
                onChange={e=>setForm({...form,progress:e.target.value})}
              />
              <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>
                {editingHasChildren?'该目标有子目标，进度条由子目标等权汇总，不手动填写':'0-100，保存时自动夹取范围'}
              </div>
            </div>

            <textarea
              className="textarea"
              placeholder="描述（可选）"
              rows={3}
              value={form.description}
              onChange={e=>setForm({...form,description:e.target.value})}
            />

            {error&&<div style={{fontSize:12,color:'#ef4444'}}>{error}</div>}
          </div>
        )}
      </Modal>
    </div>
  )
}
