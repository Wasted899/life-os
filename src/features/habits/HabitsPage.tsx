import {useState} from 'react'
import {useData} from '../../context/DataContext'
import type {Habit} from '../../core/types'
import Modal from '../../core/ui/Modal'
import CompleteTimeModal from '../todos/components/CompleteTimeModal'
import { useHabitCheckin } from './useHabitCheckin'
import {
  clampMonthlyDay,
  effectiveCustomDays,
  frequencyLabel,
  habitDue,
  progressOf,
  validateHabitConfig,
} from './habitSchedule'
import dayjs from 'dayjs'

const weekDays=[
  {d:0,name:'日'},
  {d:1,name:'一'},
  {d:2,name:'二'},
  {d:3,name:'三'},
  {d:4,name:'四'},
  {d:5,name:'五'},
  {d:6,name:'六'},
]
const FREQUENCIES=[
  {id:'daily',name:'每天'},
  {id:'weekdays',name:'工作日'},
  {id:'weekends',name:'周末'},
  {id:'custom',name:'自定义'},
  {id:'monthly_day',name:'每月某日'},
]

interface HabitForm{
  title:string
  frequency:string
  custom_days:number[]
  category_id:string
  /** 空串 = 自动（按应做天数） */
  target_count:string
  target_period:'week' | 'month'
  monthly_day:string
}

const emptyForm=(categoryId:string):HabitForm=>({
  title:'',
  frequency:'daily',
  custom_days:[],
  category_id:categoryId,
  target_count:'',
  target_period:'week',
  monthly_day:'1',
})

export default function Habits(){
  const{habits,addHabit,updateHabit,deleteHabit,categories}=useData()
  const[show,setShow]=useState(false)
  const[editing,setEditing]=useState<Habit | null>(null)
  const[form,setForm]=useState<HabitForm>(emptyForm(''))
  const[formError,setFormError]=useState('')
  const{pendingCheck,check,finishCheck,cancelCheck}=useHabitCheckin()
  const today=dayjs().format('YYYY-MM-DD')

  const openAdd=()=>{
    setEditing(null)
    setForm(emptyForm(categories[0]?.id || ''))
    setFormError('')
    setShow(true)
  }
  const openEdit=(habit:Habit)=>{
    setEditing(habit)
    setForm({
      title:habit.title,
      frequency:habit.frequency,
      custom_days:habit.custom_days || [],
      category_id:habit.category_id || '',
      target_count:habit.target_count ? String(habit.target_count) : '',
      target_period:habit.frequency === 'monthly_day' ? 'month' : (habit.target_period || 'week'),
      monthly_day:String(habit.monthly_day ?? 1),
    })
    setFormError('')
    setShow(true)
  }

  const changeFrequency=(frequency:string)=>{
    if(frequency === 'monthly_day'){
      setForm(prev=>({...prev,frequency,target_period:'month',target_count:'1',monthly_day:prev.monthly_day || '1'}))
      setFormError('')
      return
    }
    setForm(prev=>({
      ...prev,
      frequency,
      // 离开"每月某日"后回到自动目标，避免把固定 1 次带到每天习惯上
      target_period:prev.frequency === 'monthly_day' ? 'week' : prev.target_period,
      target_count:prev.frequency === 'monthly_day' ? '' : prev.target_count,
    }))
    setFormError('')
  }

  const save=()=>{
    if(!form.title.trim())return
    if(form.frequency === 'custom' && form.custom_days.length === 0){
      setFormError('请选择每周哪几天')
      return
    }
    const error=validateHabitConfig({
      frequency:form.frequency,
      custom_days:form.custom_days,
      target_count:form.target_count === '' ? '' : Number(form.target_count),
      target_period:form.frequency === 'monthly_day' ? 'month' : form.target_period,
      monthly_day:Number(form.monthly_day),
    })
    if(error){setFormError(error);return}

    const patch:Partial<Habit>={
      title:form.title.trim(),
      frequency:form.frequency,
      custom_days:form.frequency === 'custom' ? effectiveCustomDays(form.custom_days) : (form.custom_days || []),
      category_id:form.category_id,
      target_period:form.frequency === 'monthly_day' ? 'month' : form.target_period,
      target_count:form.frequency === 'monthly_day'
        ? 1
        : form.target_count === '' ? undefined : Number(form.target_count),
      monthly_day:form.frequency === 'monthly_day' ? clampMonthlyDay(Number(form.monthly_day)) : undefined,
    }
    if(editing)updateHabit(editing.id,patch)
    else addHabit({...patch,check_dates:[]} as Omit<Habit,'id'>)
    setShow(false)
  }

  // 打卡：未打卡 → 先记用时（可留空）；已打卡 → 直接取消，已写入的时间块保留
  // 逻辑已抽到 useHabitCheckin，与首页「今日」共用

  const streak=(dates:string[])=>{
    let count=0
    let cursor=dayjs()
    while(dates.includes(cursor.format('YYYY-MM-DD'))){
      count+=1
      cursor=cursor.subtract(1,'day')
    }
    return count
  }

  const freqLabel=(habit:Habit)=>{
    if(habit.frequency === 'custom'){
      const names=(habit.custom_days || []).map(day=>weekDays.find(item=>item.d === day)?.name).filter(Boolean).join('、')
      return `每周${names || '一'}`
    }
    if(habit.frequency === 'monthly_day')return `每月 ${clampMonthlyDay(habit.monthly_day)} 日`
    return frequencyLabel(habit.frequency)
  }

  // 今天该做的排前面；非今天该做的也保留展示（否则"每月某日"习惯在其它日期无法查看/编辑）
  const sortedHabits=[...habits].sort((a,b)=>Number(habitDue(b,today))-Number(habitDue(a,today)))

  return(
    <div className="card">
      <div className="card-title">习惯打卡 <button className="btn btn-primary" onClick={openAdd}>+ 添加习惯</button></div>
      {habits.length === 0 ? <div className="empty">今天没有习惯任务</div> : sortedHabits.map(habit=>{
        const due=habitDue(habit,today)
        const checked=habit.check_dates.includes(today)
        const progress=progressOf(habit,today)
        return(
          <div key={habit.id} className="card" style={{background:'#f8fafc',marginBottom:10,opacity:due ? 1 : 0.6}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <button
                onClick={()=>check(habit)}
                disabled={!due}
                title={due ? (checked ? '取消打卡' : '打卡') : '今天不需要打卡'}
                aria-label={checked ? '取消打卡' : '打卡'}
                style={{width:40,height:40,borderRadius:'50%',border:'2px solid',borderColor:checked?'#22c55e':'#cbd5e1',background:checked?'#22c55e':'transparent',color:checked?'#fff':'#94a3b8',fontSize:18,cursor:due ? 'pointer' : 'not-allowed'}}
              >{checked ? '✓' : ''}</button>
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>
                  {habit.title}
                  {habit.category_id && (
                    <span className="tag" style={{background:'#dbeafe',color:'#1e40af',fontSize:11}}>
                      {categories.find(item=>item.id === habit.category_id)?.name}
                    </span>
                  )}
                </div>
                <div style={{fontSize:12,color:'#94a3b8'}}>
                  {freqLabel(habit)} · 连续{streak(habit.check_dates)}天{due ? '' : ' · 今天不需要'}
                </div>
              </div>
              <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={()=>openEdit(habit)}>编辑</button>
              <button className="btn btn-ghost" style={{padding:'4px 8px',color:'#ef4444'}} onClick={()=>deleteHabit(habit.id)}>删</button>
            </div>
            <div style={{marginTop:10,display:'flex',gap:4}}>
              {Array.from({length:progress.total}).map((_,index)=>(
                <div key={index} style={{flex:1,height:8,borderRadius:4,background:index < progress.capped ? '#22c55e' : '#e2e8f0'}}/>
              ))}
            </div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:4,display:'flex',gap:8,alignItems:'center'}}>
              <span>{progress.range.period === 'week' ? '本周' : '本月'}完成 {progress.capped}/{progress.total}</span>
              {progress.achieved && <span className="tag" style={{background:'#dcfce7',color:'#15803d',fontSize:11}}>已达标</span>}
              {!checked && progress.remaining > 0 && <span>还差 {progress.remaining} 次</span>}
            </div>
          </div>
        )
      })}

      <Modal
        open={show}
        title={`${editing ? '编辑' : '添加'}习惯`}
        onClose={()=>setShow(false)}
        actions={
          <>
            {editing && (
              <button
                className="btn btn-danger"
                style={{marginRight:'auto'}}
                onClick={()=>{deleteHabit(editing.id);setShow(false)}}
              >删除</button>
            )}
            <button className="btn btn-ghost" onClick={()=>setShow(false)}>取消</button>
            <button className="btn btn-primary" onClick={save}>保存</button>
          </>
        }
      >
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input
            className="input"
            placeholder="习惯名称，如：背单词"
            value={form.title}
            onChange={e=>setForm({...form,title:e.target.value})}
            autoFocus
          />
          <div>
            <label style={{fontSize:13,color:'#64748b'}}>频率</label>
            <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
              {FREQUENCIES.map(item=>(
                <button
                  key={item.id}
                  className={`btn ${form.frequency === item.id ? 'btn-primary' : 'btn-outline'}`}
                  style={{padding:'6px 14px',fontSize:13}}
                  onClick={()=>changeFrequency(item.id)}
                >{item.name}</button>
              ))}
            </div>
          </div>
          {form.frequency === 'custom' && (
            <div>
              <label style={{fontSize:13,color:'#64748b'}}>选择每周哪几天</label>
              <div style={{display:'flex',gap:6,marginTop:6}}>
                {weekDays.map(day=>(
                  <button
                    key={day.d}
                    className={`btn ${form.custom_days.includes(day.d) ? 'btn-primary' : 'btn-outline'}`}
                    style={{padding:'8px 14px',fontSize:14}}
                    onClick={()=>{
                      const next=form.custom_days.includes(day.d)
                        ? form.custom_days.filter(item=>item !== day.d)
                        : [...form.custom_days,day.d]
                      setForm({...form,custom_days:next})
                      setFormError('')
                    }}
                  >{day.name}</button>
                ))}
              </div>
            </div>
          )}
          {form.frequency === 'monthly_day' && (
            <div>
              <label style={{fontSize:13,color:'#64748b'}}>每月哪一天</label>
              <select
                className="select"
                style={{marginTop:6}}
                value={form.monthly_day}
                onChange={e=>{setForm({...form,monthly_day:e.target.value});setFormError('')}}
              >
                {Array.from({length:31}).map((_,index)=>(
                  <option key={index + 1} value={String(index + 1)}>{index + 1} 日</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={{fontSize:13,color:'#64748b'}}>周期目标次数</label>
            <div style={{display:'flex',gap:8,marginTop:6}}>
              {form.frequency === 'monthly_day' ? (
                <input className="input" value="1 次 / 自然月（固定）" readOnly style={{flex:'1 1 0',minWidth:0,color:'#94a3b8'}}/>
              ) : (
                <>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    placeholder="留空 = 按应做天数自动"
                    value={form.target_count}
                    onChange={e=>{setForm({...form,target_count:e.target.value});setFormError('')}}
                    style={{flex:'1 1 0',minWidth:0}}
                  />
                  <select
                    className="select"
                    value={form.target_period}
                    onChange={e=>{setForm({...form,target_period:e.target.value as 'week' | 'month'});setFormError('')}}
                    style={{flex:'0 0 auto',width:'auto'}}
                  >
                    <option value="week">每周</option>
                    <option value="month">每月</option>
                  </select>
                </>
              )}
            </div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>
              {form.frequency === 'monthly_day' ? '「每月某日」按自然月统计，目标固定 1 次' : '留空时进度条按该频率在本周期应做的天数计算'}
            </div>
            {formError && <div style={{fontSize:12,color:'#ef4444',marginTop:4}}>{formError}</div>}
          </div>
          <select className="select" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}>
            <option value="">无分类</option>
            {categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
      </Modal>

      <CompleteTimeModal
        open={!!pendingCheck}
        title={pendingCheck?.title || ''}
        onCancel={cancelCheck}
        onConfirm={finishCheck}
      />
    </div>
  )
}
