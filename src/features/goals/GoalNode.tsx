import type {Goal} from '../../core/types'
import {
  childrenOfGoal,
  goalChildLevel,
  goalLevelLabel,
  goalLevelOf,
  goalPeriodKeyOf,
  periodLabel,
  type GoalIndex,
} from './goalTree'

interface GoalNodeProps {
  goal: Goal
  depth: number
  index: GoalIndex
  expanded: Set<string>
  onToggle: (id: string) => void
  onEdit: (goal: Goal) => void
  onDelete: (goal: Goal) => void
  onAddChild: (parent: Goal) => void
  onBump: (goal: Goal) => void
}

/**
 * 递归渲染目标节点：子节点直接从 index.childrenOf 读取，渲染期不做 filter/find。
 * 层级最多 4 层，缩进 20px；进度条纯内联 CSS。
 */
export default function GoalNode({goal,depth,index,expanded,onToggle,onEdit,onDelete,onAddChild,onBump}:GoalNodeProps){
  const level=goalLevelOf(goal)
  const children=childrenOfGoal(index,goal.id)
  const hasChildren=children.length>0
  const isExpanded=expanded.has(goal.id)
  const percent=Math.min(100,Math.max(0,index.rolledProgress.get(goal.id)??goal.progress))
  const nextLevel=goalChildLevel(level)
  const period=periodLabel(level,goalPeriodKeyOf(goal))

  return(
    <div>
      <div
        style={{
          marginLeft:depth*20,
          marginBottom:8,
          padding:'10px 12px',
          borderRadius:8,
          border:'1px solid #e2e8f0',
          background:depth===0?'#f8fafc':'#fff',
        }}
      >
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button
            className="btn btn-ghost"
            style={{padding:'2px 6px',width:26,visibility:hasChildren?'visible':'hidden'}}
            onClick={()=>onToggle(goal.id)}
            aria-label={isExpanded?'折叠':'展开'}
          >{isExpanded?'▾':'▸'}</button>
          <span className="tag" style={{background:'#e0e7ff',color:'#3730a3',fontSize:11}}>
            {goalLevelLabel(level)}目标
          </span>
          <span style={{fontSize:12,color:'#64748b'}}>{period}</span>
          <span style={{fontWeight:600,flex:1}}>
            {goal.title}
            {goal.status==='completed'&&<span className="tag" style={{background:'#dcfce7',color:'#15803d',fontSize:11,marginLeft:6}}>已完成</span>}
          </span>
          {!hasChildren&&(
            <button className="btn btn-ghost" style={{padding:'2px 8px'}} onClick={()=>onBump(goal)}>+10%</button>
          )}
          {hasChildren&&nextLevel&&(
            <button className="btn btn-ghost" style={{padding:'2px 8px'}} onClick={()=>onAddChild(goal)}>+ 子目标</button>
          )}
          <button className="btn btn-ghost" style={{padding:'2px 8px'}} onClick={()=>onEdit(goal)}>编辑</button>
          <button className="btn btn-ghost" style={{padding:'2px 8px',color:'#ef4444'}} onClick={()=>onDelete(goal)}>删</button>
        </div>

        {goal.description&&<div style={{fontSize:12,color:'#64748b',marginTop:4}}>{goal.description}</div>}

        <div style={{marginTop:8,height:8,background:'#e2e8f0',borderRadius:999,overflow:'hidden'}}>
          <div style={{
            height:'100%',
            width:`${percent}%`,
            background:percent>=100?'#22c55e':'var(--primary)',
            borderRadius:999,
            transition:'width .3s',
          }}/>
        </div>
        <div style={{fontSize:11,color:'#94a3b8',marginTop:4,display:'flex',gap:8}}>
          <span>{percent}%</span>
          {hasChildren&&<span>由 {children.length} 个子目标等权汇总</span>}
        </div>
      </div>

      {hasChildren&&isExpanded&&children.map(child=>(
        <GoalNode
          key={child.id}
          goal={child}
          depth={depth+1}
          index={index}
          expanded={expanded}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onBump={onBump}
        />
      ))}
    </div>
  )
}
