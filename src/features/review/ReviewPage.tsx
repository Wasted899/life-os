import {useState,useEffect} from 'react'
import {useData} from '../../context/DataContext'
import dayjs from 'dayjs'
import type {ReviewPeriod} from '../../core/types'
type ReviewTab=ReviewPeriod
export default function Review(){
  const{todos,habits,timeBlocks}=useData()
  const[tab,setTab]=useState<ReviewTab>('daily')
  const[date,setDate]=useState(dayjs().format('YYYY-MM-DD'))
  const[week,setWeek]=useState(dayjs().format('YYYY-[W]WW'))
  const[month,setMonth]=useState(dayjs().format('YYYY-MM'))
  const[year,setYear]=useState(dayjs().format('YYYY'))
  const[form,setForm]=useState({done:'',undone:'',tomorrow:'',mood:3,summary:'',next:''})
  const loadReviews=(key:string):any[]=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}}
  const saveReview=(key:string,data:any)=>{const list=loadReviews(key);const idx=list.findIndex((r:any)=>{if(r.date)return r.date===data.date;if(r.week)return r.week===data.week;if(r.month)return r.month===data.month;if(r.year)return r.year===data.year;return false});if(idx>=0)list[idx]=data;else list.push(data);try{localStorage.setItem(key,JSON.stringify(list))}catch{}}
  const dailyReviews=loadReviews('p_daily_reviews')
  const weeklyReviews=loadReviews('p_weekly_reviews')
  const monthlyReviews=loadReviews('p_monthly_reviews')
  const yearlyReviews=loadReviews('p_yearly_reviews')
  const loadDaily=()=>{const r=dailyReviews.find((x:any)=>x.date===date);if(r)setForm(f=>({...f,done:r.done||'',undone:r.undone||'',tomorrow:r.tomorrow||'',mood:r.mood||3}));else setForm(f=>({...f,done:'',undone:'',tomorrow:'',mood:3}))}
  const loadWeekly=()=>{const r=weeklyReviews.find((x:any)=>x.week===week);if(r)setForm(f=>({...f,summary:r.summary||'',next:r.next_week||''}));else setForm(f=>({...f,summary:'',next:''}))}
  const loadMonthly=()=>{const r=monthlyReviews.find((x:any)=>x.month===month);if(r)setForm(f=>({...f,summary:r.summary||'',next:r.next_month||''}));else setForm(f=>({...f,summary:'',next:''}))}
  const loadYearly=()=>{const r=yearlyReviews.find((x:any)=>x.year===year);if(r)setForm(f=>({...f,summary:r.summary||'',next:r.next_year||''}));else setForm(f=>({...f,summary:'',next:''}))}
  useEffect(()=>{if(tab==='daily')loadDaily();else if(tab==='weekly')loadWeekly();else if(tab==='monthly')loadMonthly();else loadYearly()},[tab,date,week,month,year])
  const todayTodos=todos.filter(t=>t.due_date===date)
  const doneRate=todayTodos.length>0?Math.round((todayTodos.filter(t=>t.completed).length/todayTodos.length)*100):0
  const todayHabits=habits.filter(h=>h.check_dates.includes(date))
  const focus=timeBlocks.filter(t=>t.date===date).reduce((s,t)=>s+(t.end-t.start),0)
  const save=()=>{if(tab==='daily')saveReview('p_daily_reviews',{date,done:form.done,undone:form.undone,tomorrow:form.tomorrow,mood:form.mood});else if(tab==='weekly')saveReview('p_weekly_reviews',{week,summary:form.summary,next_week:form.next});else if(tab==='monthly')saveReview('p_monthly_reviews',{month,summary:form.summary,next_month:form.next});else saveReview('p_yearly_reviews',{year,summary:form.summary,next_year:form.next});alert('保存成功')}
  const tabs:[ReviewTab,string][]=[['daily','每日'],['weekly','每周'],['monthly','每月'],['yearly','每年']]
  return(<div className="card"><div className="card-title"><div style={{display:'flex',gap:8}}>{tabs.map(([id,label])=><button key={id} className={`btn ${tab===id?'btn-primary':'btn-ghost'}`} onClick={()=>setTab(id)}>{label}</button>)}</div></div>
    {tab==='daily'&&<><div style={{display:'flex',gap:12,alignItems:'center',marginBottom:16,flexWrap:'wrap'}}><input type="date" className="input" style={{width:160}} value={date} onChange={e=>setDate(e.target.value)}/><div style={{display:'flex',gap:16,fontSize:13,color:'#64748b'}}><span>待办完成率：{doneRate}%</span><span>习惯打卡：{todayHabits.length}个</span><span>专注时长：{focus.toFixed(1)}h</span></div></div><div style={{marginBottom:16}}><label style={{fontSize:13,color:'#64748b'}}>心情评分</label><div style={{display:'flex',gap:8,marginTop:6}}>{[1,2,3,4,5].map(n=><button key={n} className={`btn ${form.mood>=n?'btn-primary':'btn-outline'}`} style={{padding:'8px 16px',fontSize:18}} onClick={()=>setForm({...form,mood:n})}>{'⭐'.repeat(n)}</button>)}</div></div><div style={{marginBottom:12}}><label style={{fontSize:13,color:'#64748b'}}>今日完成</label><textarea className="textarea" rows={3} value={form.done} onChange={e=>setForm({...form,done:e.target.value})} placeholder="今天完成了什么？"/></div><div style={{marginBottom:12}}><label style={{fontSize:13,color:'#64748b'}}>未完成及原因</label><textarea className="textarea" rows={3} value={form.undone} onChange={e=>setForm({...form,undone:e.target.value})} placeholder="什么没完成？为什么？"/></div><div style={{marginBottom:16}}><label style={{fontSize:13,color:'#64748b'}}>明日计划</label><textarea className="textarea" rows={3} value={form.tomorrow} onChange={e=>setForm({...form,tomorrow:e.target.value})} placeholder="明天计划做什么？"/></div></>}
    {tab==='weekly'&&<><div style={{marginBottom:16}}><input type="week" className="input" style={{width:200}} value={week} onChange={e=>setWeek(e.target.value)}/></div><div style={{marginBottom:12}}><label style={{fontSize:13,color:'#64748b'}}>本周总结</label><textarea className="textarea" rows={5} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} placeholder="本周整体表现、收获、不足..."/></div><div style={{marginBottom:16}}><label style={{fontSize:13,color:'#64748b'}}>下周计划</label><textarea className="textarea" rows={5} value={form.next} onChange={e=>setForm({...form,next:e.target.value})} placeholder="下周目标和计划..."/></div></>}
    {tab==='monthly'&&<><div style={{marginBottom:16}}><input type="month" className="input" style={{width:200}} value={month} onChange={e=>setMonth(e.target.value)}/></div><div style={{marginBottom:12}}><label style={{fontSize:13,color:'#64748b'}}>月度总结</label><textarea className="textarea" rows={6} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} placeholder="本月整体回顾..."/></div><div style={{marginBottom:16}}><label style={{fontSize:13,color:'#64748b'}}>下月计划</label><textarea className="textarea" rows={6} value={form.next} onChange={e=>setForm({...form,next:e.target.value})} placeholder="下月目标和计划..."/></div></>}
    {tab==='yearly'&&<><div style={{marginBottom:16}}><input type="number" className="input" style={{width:120}} value={year} onChange={e=>setYear(e.target.value)}/></div><div style={{marginBottom:12}}><label style={{fontSize:13,color:'#64748b'}}>年度总结</label><textarea className="textarea" rows={8} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})} placeholder="这一年的整体回顾、最大收获、遗憾..."/></div><div style={{marginBottom:16}}><label style={{fontSize:13,color:'#64748b'}}>新年计划</label><textarea className="textarea" rows={8} value={form.next} onChange={e=>setForm({...form,next:e.target.value})} placeholder="新一年的目标和计划..."/></div></>}
    <button className="btn btn-primary" onClick={save} style={{padding:'10px 32px'}}>保存复盘</button></div>)
}