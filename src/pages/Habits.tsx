import {useState} from 'react'
import {useData} from '../context/DataContext'
import dayjs from 'dayjs'
const weekDays=[{d:0,name:'日'},{d:1,name:'一'},{d:2,name:'二'},{d:3,name:'三'},{d:4,name:'四'},{d:5,name:'五'},{d:6,name:'六'}]
export default function Habits(){
  const{habits,addHabit,updateHabit,deleteHabit,categories,addTimeBlock}=useData()
  const[show,setShow]=useState(false)
  const[editing,setEditing]=useState<any>(null)
  const[form,setForm]=useState({title:'',frequency:'daily',custom_days:[] as number[],category_id:''})
  const today=dayjs().format('YYYY-MM-DD')
  const openAdd=()=>{setEditing(null);setForm({title:'',frequency:'daily',custom_days:[],category_id:categories[0]?.id||''});setShow(true)}
  const openEdit=(h:any)=>{setEditing(h);setForm({title:h.title,frequency:h.frequency,custom_days:h.custom_days||[],category_id:h.category_id||''});setShow(true)}
  const save=()=>{if(!form.title.trim())return;if(editing)updateHabit(editing.id,form);else addHabit({...form,check_dates:[]});setShow(false)}
  const check=(id:string)=>{const h=habits.find(x=>x.id===id);if(!h)return;if(h.check_dates.includes(today)){updateHabit(id,{check_dates:h.check_dates.filter(d=>d!==today)});return}const m=prompt(`"${h.title}"打卡！本次用了多少分钟？`,'30');if(m&&!isNaN(+m)){const cat=categories.find(x=>x.id===h.category_id);addTimeBlock({date:today,start:dayjs().hour(),end:dayjs().hour()+(+m)/60,title:h.title,category:cat?.name||'学习',source:'habit'})}updateHabit(id,{check_dates:[...h.check_dates,today]})}
  const streak=(dates:string[])=>{let c=0;let d=dayjs();while(dates.includes(d.format('YYYY-MM-DD'))){c++;d=d.subtract(1,'day')}return c}
  const freqDays=(f:string,cd:number[])=>f==='daily'?7:f==='weekdays'?5:f==='weekends'?2:f==='custom'?cd.length||7:7
  const dueToday=(h:any)=>{const d=dayjs().day();if(h.frequency==='daily')return true;if(h.frequency==='weekdays')return d>=1&&d<=5;if(h.frequency==='weekends')return d===0||d===6;if(h.frequency==='custom')return(h.custom_days||[]).includes(d);return true}
  const freqLabel=(h:any)=>{if(h.frequency==='daily')return'每天';if(h.frequency==='weekdays')return'工作日';if(h.frequency==='weekends')return'周末';if(h.frequency==='custom')return'每周'+(h.custom_days||[]).map((d:number)=>weekDays.find(w=>w.d===d)?.name).join('、');return h.frequency}
  return(
    <div className="card">
      <div className="card-title">习惯打卡 <button className="btn btn-primary" onClick={openAdd}>+ 添加习惯</button></div>
      {habits.filter(dueToday).length===0?<div className="empty">今天没有习惯任务</div>:habits.filter(dueToday).map(h=>{
        const checked=h.check_dates.includes(today);const total=freqDays(h.frequency,h.custom_days||[]);const weekDone=h.check_dates.filter(d=>dayjs(d).isAfter(dayjs().subtract(7,'day'))).length
        return(
          <div key={h.id} className="card" style={{background:'#f8fafc',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <button onClick={()=>check(h.id)} style={{width:40,height:40,borderRadius:'50%',border:'2px solid',borderColor:checked?'#22c55e':'#cbd5e1',background:checked?'#22c55e':'transparent',color:checked?'#fff':'#94a3b8',fontSize:18,cursor:'pointer'}}>{checked?'✓':''}</button>
              <div style={{flex:1}}><div style={{fontWeight:600}}>{h.title} {h.category_id&&<span className="tag" style={{background:'#dbeafe',color:'#1e40af',fontSize:11}}>{categories.find(c=>c.id===h.category_id)?.name}</span>}</div><div style={{fontSize:12,color:'#94a3b8'}}>{freqLabel(h)} · 连续{streak(h.check_dates)}天</div></div>
              <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={()=>openEdit(h)}>编辑</button>
              <button className="btn btn-ghost" style={{padding:'4px 8px',color:'#ef4444'}} onClick={()=>deleteHabit(h.id)}>删</button>
            </div>
            <div style={{marginTop:10,display:'flex',gap:4}}>{Array.from({length:total}).map((_,i)=>(<div key={i} style={{flex:1,height:8,borderRadius:4,background:i<Math.min(weekDone,total)?'#22c55e':'#e2e8f0'}}/>))}</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>本周完成 {Math.min(weekDone,total)}/{total}</div>
          </div>
        )
      })}
      {show&&<div className="modal-overlay" onClick={()=>setShow(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-title">{editing?'编辑':'添加'}习惯</div><div style={{display:'flex',flexDirection:'column',gap:12}}><input className="input" placeholder="习惯名称，如：背单词" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} autoFocus/><div><label style={{fontSize:13,color:'#64748b'}}>频率</label><div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>{[{id:'daily',name:'每天'},{id:'weekdays',name:'工作日'},{id:'weekends',name:'周末'},{id:'custom',name:'自定义'}].map(f=>(<button key={f.id} className={`btn ${form.frequency===f.id?'btn-primary':'btn-outline'}`} style={{padding:'6px 14px',fontSize:13}} onClick={()=>setForm({...form,frequency:f.id})}>{f.name}</button>))}</div></div>{form.frequency==='custom'&&<div><label style={{fontSize:13,color:'#64748b'}}>选择每周哪几天</label><div style={{display:'flex',gap:6,marginTop:6}}>{weekDays.map(w=>(<button key={w.d} className={`btn ${form.custom_days.includes(w.d)?'btn-primary':'btn-outline'}`} style={{padding:'8px 14px',fontSize:14}} onClick={()=>{const cd=form.custom_days.includes(w.d)?form.custom_days.filter(x=>x!==w.d):[...form.custom_days,w.d];setForm({...form,custom_days:cd})}}>{w.name}</button>))}</div></div>}<select className="select" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="modal-actions">{editing&&<button className="btn btn-danger" style={{marginRight:'auto'}} onClick={()=>{deleteHabit(editing.id);setShow(false)}}>删除</button>}<button className="btn btn-ghost" onClick={()=>setShow(false)}>取消</button><button className="btn btn-primary" onClick={save}>保存</button></div></div></div>}
    </div>
  )
}