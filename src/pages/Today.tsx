import {useState} from 'react'
import {useData} from '../context/DataContext'
import dayjs from 'dayjs'
import {Link} from 'react-router-dom'
export default function Today(){
  const{todos,habits,days,transactions,timeBlocks,goals,updateTodo,addTimeBlock,categories,updateHabit}=useData()
  const[goalFilter,setGoalFilter]=useState<'all'|'yearly'|'monthly'|'weekly'>('all')
  const today=dayjs().format('YYYY-MM-DD')
  const todayTodos=todos.filter(t=>(!t.due_date||t.due_date===today)&&!t.completed)
  const todayHabits=habits.filter(h=>!h.check_dates.includes(today))
  const upcoming=days.filter(d=>d.type!=='countup'&&dayjs(d.date).diff(dayjs(),'day')>=0).sort((a,b)=>dayjs(a.date).diff(dayjs(b.date))).slice(0,3)
  const todayExpense=transactions.filter(t=>t.date===today&&t.type==='expense').reduce((s,t)=>s+t.amount,0)
  const todayFocus=timeBlocks.filter(t=>t.date===today).reduce((s,t)=>s+(t.end-t.start),0)
  const showGoals=goals.filter(g=>g.status!=='completed'&&(goalFilter==='all'||g.type===goalFilter)).slice(0,5)
  const toggleTodo=(id:string)=>{const t=todos.find(x=>x.id===id);if(!t)return;const mins=prompt('本次用了多少分钟？（不填则不记录时间）','');if(mins&&!isNaN(+mins)){const cat=categories.find(c=>c.id===t.category_id);addTimeBlock({date:today,start:dayjs().hour(),end:dayjs().hour()+(+mins)/60,title:t.title,category:cat?.name||'学习',source:'todo'})}updateTodo(id,{completed:!t.completed})}
  const checkHabit=(id:string)=>{const h=habits.find(x=>x.id===id);if(!h)return;if(h.check_dates.includes(today)){updateHabit(id,{check_dates:h.check_dates.filter(d=>d!==today)});return}const mins=prompt(`"${h.title}"打卡！本次用了多少分钟？`,'30');if(mins&&!isNaN(+mins)){const cat=categories.find(x=>x.id===h.category_id);addTimeBlock({date:today,start:dayjs().hour(),end:dayjs().hour()+(+mins)/60,title:h.title,category:cat?.name||'学习',source:'habit'})}updateHabit(id,{check_dates:[...h.check_dates,today]})}
  const stats=[
    {label:'今日待办',value:todayTodos.length,icon:'✅',bg:'linear-gradient(135deg,#dbeafe,#bfdbfe)',color:'#1d4ed8'},
    {label:'待打卡习惯',value:todayHabits.length,icon:'🔥',bg:'linear-gradient(135deg,#fee2e2,#fecaca)',color:'#b91c1c'},
    {label:'今日专注',value:todayFocus.toFixed(1)+'h',icon:'⏱️',bg:'linear-gradient(135deg,#dcfce7,#bbf7d0)',color:'#15803d'},
    {label:'今日支出',value:'¥'+todayExpense.toFixed(2),icon:'💰',bg:'linear-gradient(135deg,#fef3c7,#fde68a)',color:'#b45309'},
  ]
  return(
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:20}}>
        {stats.map(s=>(<div key={s.label} className="card" style={{margin:0,padding:18,background:s.bg,border:'none'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:12,color:s.color,opacity:0.8,fontWeight:500}}>{s.label}</div><div style={{fontSize:30,fontWeight:800,color:s.color,marginTop:6}}>{s.value}</div></div><div style={{fontSize:28,opacity:0.7}}>{s.icon}</div></div></div>))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div>
          <div className="card"><div className="card-title"><span>📋 今日待办</span><Link to="/todos" className="btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}}>全部 →</Link></div>
            {todayTodos.length===0?<div className="empty">🎉 今日无待办</div>:todayTodos.slice(0,8).map(t=>(<div key={t.id} style={{padding:'10px 0',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10}}><input type="checkbox" checked={t.completed} onChange={()=>toggleTodo(t.id)} style={{width:18,height:18,cursor:'pointer'}}/><span style={{width:8,height:8,borderRadius:'50%',background:t.priority==='q1'?'#ef4444':t.priority==='q2'?'#f59e0b':t.priority==='q3'?'#3b82f6':'#94a3b8',flexShrink:0}}/><span style={{flex:1,fontSize:14}}>{t.title}</span>{t.source==='habit'&&<span className="tag" style={{background:'#fef3c7',color:'#92400e',fontSize:11}}>习惯</span>}</div>))}{todayTodos.length>8&&<div style={{textAlign:'center',padding:8,fontSize:12,color:'#94a3b8'}}>还有{todayTodos.length-8}项</div>}</div>
          <div className="card"><div className="card-title"><span>🎯 目标进度</span><div style={{display:'flex',gap:4}}>{(['all','yearly','monthly','weekly'] as const).map(f=>(<button key={f} className={`btn ${goalFilter===f?'btn-primary':'btn-ghost'}`} style={{padding:'3px 8px',fontSize:11}} onClick={()=>setGoalFilter(f)}>{f==='all'?'全部':f==='yearly'?'年度':f==='monthly'?'月度':'周度'}</button>))}</div></div>
            {showGoals.length===0?<div className="empty">暂无进行中目标</div>:showGoals.map(g=>(<div key={g.id} style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:4}}><span>{g.title}</span><span style={{color:'#64748b'}}>{g.progress}%</span></div><div style={{height:6,background:'#f1f5f9',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:`${g.progress}%`,background:'var(--primary)',transition:'width .3s'}}/></div></div>))}</div>
        </div>
        <div>
          <div className="card" style={{marginBottom:16}}><div className="card-title"><span>⏰ 即将到来</span><Link to="/days" className="btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}}>全部 →</Link></div>
            {upcoming.length===0?<div className="empty">暂无即将到来的事件</div>:upcoming.map(c=>{const d=dayjs(c.date).diff(dayjs(),'day')+1;return(<div key={c.id} style={{padding:'10px 0',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontWeight:500,fontSize:14}}>{c.title}</div><div style={{fontSize:11,color:'#94a3b8'}}>{dayjs(c.date).format('M月D日')} · {c.category}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:22,fontWeight:800,color:d<=7?'#ef4444':'#2563eb'}}>{d}</div><div style={{fontSize:11,color:'#94a3b8'}}>天后</div></div></div>)})}</div>
          <div className="card"><div className="card-title"><span>🔥 今日习惯</span><Link to="/habits" className="btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}}>全部 →</Link></div>
            {todayHabits.length===0?<div className="empty">🎉 今日习惯全部完成</div>:todayHabits.slice(0,5).map(h=>(<div key={h.id} style={{padding:'8px 0',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:8}}><button onClick={()=>checkHabit(h.id)} style={{width:28,height:28,borderRadius:'50%',border:'2px solid #cbd5e1',background:'transparent',cursor:'pointer',flexShrink:0}}/><span style={{flex:1,fontSize:14}}>{h.title}</span><span style={{fontSize:11,color:'#94a3b8'}}>{h.frequency==='daily'?'每天':h.frequency==='weekdays'?'工作日':h.frequency==='weekends'?'周末':'自定义'}</span></div>))}</div>
        </div>
      </div>
    </div>
  )
}