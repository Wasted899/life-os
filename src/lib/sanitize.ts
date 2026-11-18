/**
 * 数据形状兜底（sanitize）
 *
 * 【唯一执行顺序，请勿调整】
 *   原始数据（localStorage / 导入 JSON）
 *     → sanitizeAll / sanitizeXxx（本文件：只做兜底占位，保证是数组、有 id、必要默认值存在）
 *     → migrate（core/migrate.ts：数据规范化的唯一出口，产出即最终结果）
 *     → 写入 React state / storage
 *
 * 写法约束：
 * 1. 每个条目必须是 `{ ...raw, 规范字段 }`：raw 展开在最前面，规范字段在后。
 *    这样既保留未知字段（供 migrate 透传统计），又保证旧字段（name/date/time/...）不会覆盖规范化结果。
 * 2. 严禁把 `...raw` 放到默认值之后。那会让旧字段原样盖回 sanitize/migrate 的结果，
 *    历史上正是这个顺序导致规范化失效，后续不要再加回来。
 * 3. 本文件不删除旧字段、不做过深类型转换，具体映射由 migrate 负责。
 *    例外：sanitizeTodos 负责 priority → quadrant 归一，sanitizeMemos 负责 kind → items 归一
 *    （云端拉取不经过 migrate，见各函数注释）。
 */
import dayjs from 'dayjs'
import type { MemoItem } from '../core/types'
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36)
const arr=(v:any):any[]=>Array.isArray(v)?v:[]
const asQuadrant=(v:any):'q1'|'q2'|'q3'|'q4'=>(v==='q1'||v==='q2'||v==='q3'||v==='q4')?v:'q2'
/** 清单数量：整数且落在 1..9999，其余（含 null/NaN/0/负数/非数字）回落 1 */
const asMemoQty=(v:any):number=>{
  const n=typeof v==='number'?v:typeof v==='string'?parseFloat(v):NaN
  if(!Number.isFinite(n))return 1
  const i=Math.floor(n)
  return i<1?1:i>9999?9999:i
}
/**
 * 购物清单条目兜底：非数组 → []；非对象条目丢弃；缺 id 补 uid（重复则重新生成）；
 * 缺 text 补空串；done 严格 true 才算已购；qty 非法回落 1。
 * 云端拉取不经过 migrate，所以必须在这里就把 items 变成可安全渲染的形状。
 */
export const sanitizeMemoItems=(raw:any):MemoItem[]=>{
  const out:MemoItem[]=[]
  const seen=new Set<string>()
  for(const it of arr(raw)){
    if(!it||typeof it!=='object')continue
    let id=typeof it.id==='string'&&it.id?it.id:uid()
    while(seen.has(id))id=uid()
    seen.add(id)
    out.push({...it,id,text:typeof it.text==='string'?it.text:'',done:it.done===true,qty:asMemoQty(it.qty)})
  }
  return out
}
/**
 * priority → quadrant 的唯一归一入口。
 * 放在 sanitize 而不是 migrate：sanitizeAll 是所有数据进入 state 的必经之路
 * （冷启动/导入 → normalizeLocalData → sanitizeAll；云端拉取/登出恢复 → applyDomainData → sanitizeAll），
 * 而 migrate 不覆盖云端拉取链路。归一后 priority 不再输出，也不允许再写入。
 */
export const sanitizeTodos=(raw:any)=>arr(raw).map((t:any)=>{
  const title=t.title||t.name||'未命名任务'
  const{priority,...rest}=t
  return{...rest,id:t.id||uid(),title,quadrant:asQuadrant(t.quadrant||priority),due_date:t.due_date||t.date||null,due_time:t.due_time||t.time||'',completed:!!t.completed,list_id:t.list_id||t.listId||'inbox',category_id:t.category_id||t.categoryId||'',pinned:!!t.pinned,status:t.status||'todo',source:t.source||'todo',habit_id:t.habit_id||t.habitId||null}
})
export const sanitizeHabits=(raw:any)=>arr(raw).map((h:any)=>{
  let frequency=h.frequency||'daily'
  let custom_days=h.custom_days||h.customDays||[]
  if(typeof frequency==='string'){
    if(frequency==='everyday'||frequency==='daily')frequency='daily'
    else if(frequency==='weekday'||frequency==='workdays')frequency='weekdays'
    else if(frequency==='weekend'||frequency==='weekends')frequency='weekends'
    else if(frequency==='custom'||frequency==='weekly'){frequency='custom';if(!custom_days.length)custom_days=[1]}
    else if(frequency==='monthly_day')frequency='monthly_day'
    else frequency='daily'
  }
  return{...h,id:h.id||uid(),title:h.title||h.name||'未命名习惯',frequency,custom_days:Array.isArray(custom_days)?custom_days:[],check_dates:Array.isArray(h.check_dates)?h.check_dates:[],category_id:h.category_id||h.categoryId||''}
})
// 注意：不要在这里改写 type/category。旧数据可能把分类名存在 type 里，
// 需要在 migrate 中判断 type ∉ {countdown,countup} 后再决定它是分类还是类型。
export const sanitizeDays=(raw:any)=>arr(raw).map((d:any)=>({...d,id:d.id||uid(),title:d.title||d.name||'未命名事件',date:d.date||dayjs().format('YYYY-MM-DD'),pinned:!!d.pinned}))
export const sanitizeTransactions=(raw:any)=>arr(raw).map((t:any)=>{
  const tx={...t,id:t.id||uid(),date:t.date||dayjs().format('YYYY-MM-DD'),type:t.type==='income'?'income':'expense',category:t.category||'其他',amount:typeof t.amount==='number'?t.amount:parseFloat(t.amount)||0,account:t.account||'微信',note:t.note||t.remark||''}
  if(typeof tx.recurring_id!=='string'||!tx.recurring_id)delete tx.recurring_id
  return tx
})
export const sanitizeTimeBlocks=(raw:any)=>arr(raw).map((t:any)=>({...t,id:t.id||uid(),date:t.date||dayjs().format('YYYY-MM-DD'),start:typeof t.start==='number'?t.start:parseFloat(t.start)||9,end:typeof t.end==='number'?t.end:parseFloat(t.end)||10,title:t.title||t.name||'未命名',category:t.category||'其他',source:t.source||'',linked_todo_id:typeof t.linked_todo_id==='string'&&t.linked_todo_id?t.linked_todo_id:undefined}))
export const sanitizeGoals=(raw:any)=>arr(raw).map((g:any)=>({...g,id:g.id||uid(),title:g.title||g.name||'未命名目标',type:g.type||g.period||'yearly',parent_id:g.parent_id||g.parentId||null,progress:typeof g.progress==='number'?g.progress:0,status:g.status||'active',description:g.description||g.desc||''}))
export const sanitizeMemos=(raw:any)=>arr(raw).map((m:any)=>{
  const items=sanitizeMemoItems(m.items)
  const kind=m.kind==='note'||m.kind==='checklist'?m.kind:(items.length?'checklist':'note')
  return{...m,id:m.id||uid(),title:m.title||'',content:m.content||m.text||'',category:m.category||'其他',pinned:!!m.pinned,completed:!!m.completed,created_at:m.created_at||dayjs().toISOString(),kind,items}
})
export const sanitizePomodoros=(raw:any)=>arr(raw).map((p:any)=>({...p,id:p.id||uid(),date:p.date||dayjs().format('YYYY-MM-DD'),duration:typeof p.duration==='number'?p.duration:25,task:p.task||'',completed:p.completed!==false,mode:p.mode||'countdown'}))
export const sanitizeCategories=(raw:any)=>{
  const def=[{id:'c1',name:'学习',color:'#3b82f6'},{id:'c2',name:'工作',color:'#8b5cf6'},{id:'c3',name:'生活',color:'#22c55e'},{id:'c4',name:'娱乐',color:'#f59e0b'},{id:'c5',name:'其他',color:'#94a3b8'}]
  const list=arr(raw)
  return list.length?list.map((c:any)=>({...c,id:c.id||uid(),name:c.name||'未分类',color:c.color||'#94a3b8'})):def
}
export const sanitizeLists=(raw:any)=>{
  const def=[{id:'inbox',name:'收集箱',color:'#2563eb',icon:'📥'}]
  const list=arr(raw)
  return list.length?list.map((l:any)=>({...l,id:l.id||uid(),name:l.name||'未命名清单',color:l.color||'#2563eb',icon:l.icon||'📁'})):def
}
export const sanitizeFinanceCategories=(raw:any)=>{
  const def=[{id:'fc1',name:'餐饮',type:'expense',color:'#f59e0b',icon:'🍜'},{id:'fc2',name:'交通',type:'expense',color:'#3b82f6',icon:'🚗'},{id:'fc3',name:'购物',type:'expense',color:'#ec4899',icon:'🛍️'},{id:'fc4',name:'娱乐',type:'expense',color:'#8b5cf6',icon:'🎮'},{id:'fc5',name:'学习',type:'expense',color:'#10b981',icon:'📚'},{id:'fc6',name:'其他',type:'expense',color:'#94a3b8',icon:'📦'},{id:'fi1',name:'生活费',type:'income',color:'#22c55e',icon:'💰'},{id:'fi2',name:'兼职',type:'income',color:'#3b82f6',icon:'💼'},{id:'fi3',name:'奖学金',type:'income',color:'#f59e0b',icon:'🏆'},{id:'fi4',name:'其他',type:'income',color:'#94a3b8',icon:'📦'}]
  const list=arr(raw)
  return list.length?list.map((c:any)=>({...c,id:c.id||uid(),name:c.name||'未分类',type:c.type||'expense',color:c.color||'#94a3b8',icon:c.icon||'📦'})):def
}
export const sanitizeAccounts=(raw:any)=>arr(raw).map((a:any)=>({...a,id:a.id||uid(),name:a.name||'账户',balance:typeof a.balance==='number'?a.balance:0,...(typeof a.opening_balance==='number'&&Number.isFinite(a.opening_balance)?{opening_balance:a.opening_balance}:{}),icon:a.icon||'💳'}))
export const sanitizeRecurrings=(raw:any)=>arr(raw).map((r:any)=>{
  const startDate=r.start_date||r.startDate||dayjs().format('YYYY-MM-DD')
  return{...r,id:r.id||uid(),name:r.name||'周期账单',amount:typeof r.amount==='number'?r.amount:0,cycle:r.cycle==='yearly'?'yearly':'monthly',day:typeof r.day==='number'?r.day:1,category:r.category||'其他',account:r.account||'微信',type:r.type==='income'?'income':'expense',paused:r.paused===true,...(r.account_id?{account_id:r.account_id}:{}),custom_period:r.custom_period||'day',start_date:startDate,next_date:r.next_date||startDate}
})
export const sanitizeAll=(data:any)=>{
  if(!data||typeof data!=='object')return{}
  return{todos:sanitizeTodos(data.todos),lists:sanitizeLists(data.lists),categories:sanitizeCategories(data.categories),goals:sanitizeGoals(data.goals),habits:sanitizeHabits(data.habits),days:sanitizeDays(data.days),timeBlocks:sanitizeTimeBlocks(data.timeBlocks),pomodoros:sanitizePomodoros(data.pomodoros),transactions:sanitizeTransactions(data.transactions),memos:sanitizeMemos(data.memos),financeCategories:sanitizeFinanceCategories(data.financeCategories),accounts:sanitizeAccounts(data.accounts),recurrings:sanitizeRecurrings(data.recurrings)}
}
