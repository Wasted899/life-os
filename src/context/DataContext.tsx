import {createContext,useContext,useEffect,useState,useCallback,ReactNode} from 'react'
import {load,save,uid} from '../lib/storage'
import {sanitizeTodos,sanitizeHabits,sanitizeDays,sanitizeTransactions,sanitizeTimeBlocks,sanitizeGoals,sanitizeMemos,sanitizePomodoros,sanitizeCategories,sanitizeLists,sanitizeAll,sanitizeFinanceCategories,sanitizeAccounts,sanitizeRecurrings} from '../lib/sanitize'
import type{Todo,TodoList,Category,Goal,Habit,ImportantDay,TimeBlock,Pomodoro,Transaction,Memo,FinanceCategory,Account,Recurring} from '../lib/supabase'
import {supabase,isCloudMode,fetchTable,insertRow,updateRow,deleteRow,batchInsert,clearTable,TABLE_MAP} from '../lib/supabase'
import {useAuth} from './AuthContext'
import dayjs from 'dayjs'

type Ctx={
  todos:Todo[];addTodo:(t:Omit<Todo,'id'>)=>void;updateTodo:(id:string,p:Partial<Todo>)=>void;deleteTodo:(id:string)=>void
  lists:TodoList[];addList:(l:Omit<TodoList,'id'>)=>void;updateList:(id:string,p:Partial<TodoList>)=>void;deleteList:(id:string)=>void
  categories:Category[];addCategory:(c:Omit<Category,'id'>)=>void;updateCategory:(id:string,p:Partial<Category>)=>void;deleteCategory:(id:string)=>void
  goals:Goal[];addGoal:(g:Omit<Goal,'id'>)=>void;updateGoal:(id:string,p:Partial<Goal>)=>void;deleteGoal:(id:string)=>void
  habits:Habit[];addHabit:(h:Omit<Habit,'id'>)=>void;updateHabit:(id:string,p:Partial<Habit>)=>void;deleteHabit:(id:string)=>void
  days:ImportantDay[];addDay:(d:Omit<ImportantDay,'id'>)=>void;updateDay:(id:string,p:Partial<ImportantDay>)=>void;deleteDay:(id:string)=>void
  timeBlocks:TimeBlock[];addTimeBlock:(t:Omit<TimeBlock,'id'>)=>void;updateTimeBlock:(id:string,p:Partial<TimeBlock>)=>void;deleteTimeBlock:(id:string)=>void
  pomodoros:Pomodoro[];addPomodoro:(p:Omit<Pomodoro,'id'>)=>void
  transactions:Transaction[];addTransaction:(t:Omit<Transaction,'id'>)=>void;updateTransaction:(id:string,p:Partial<Transaction>)=>void;deleteTransaction:(id:string)=>void
  memos:Memo[];addMemo:(m:Omit<Memo,'id'>)=>void;updateMemo:(id:string,p:Partial<Memo>)=>void;deleteMemo:(id:string)=>void
  financeCategories:FinanceCategory[];addFinanceCategory:(c:Omit<FinanceCategory,'id'>)=>void;updateFinanceCategory:(id:string,p:Partial<FinanceCategory>)=>void;deleteFinanceCategory:(id:string)=>void
  accounts:Account[];addAccount:(a:Omit<Account,'id'>)=>void;updateAccount:(id:string,p:Partial<Account>)=>void;deleteAccount:(id:string)=>void
  recurrings:Recurring[];addRecurring:(r:Omit<Recurring,'id'>)=>void;updateRecurring:(id:string,p:Partial<Recurring>)=>void;deleteRecurring:(id:string)=>void
  syncHabitsToTodos:()=>void
  exportAll:()=>string;importAll:(j:string)=>void;resetAll:()=>void
  uploadLocalToCloud:(skipClear?:boolean)=>Promise<void>
  testCloudConnection:()=>Promise<void>
  uploading:boolean
  cloudLoading:boolean
}

const C=createContext<Ctx>({} as Ctx)

const habitDue=(h:Habit,d:dayjs.Dayjs)=>{
  if(h.frequency==='daily')return true
  if(h.frequency==='weekdays')return d.day()>=1&&d.day()<=5
  if(h.frequency==='weekends')return d.day()===0||d.day()===6
  if(h.frequency==='custom')return(h.custom_days||[]).includes(d.day())
  return true
}

// 本地存储的key
const LS_KEYS={
  todos:'p_todos',lists:'p_lists',categories:'p_cats',goals:'p_goals',
  habits:'p_habits',days:'p_days',timeBlocks:'p_time',pomodoros:'p_pomo',
  transactions:'p_tx',memos:'p_memos',financeCategories:'p_fc',accounts:'p_accts',recurrings:'p_rec'
}

export function DataProvider({children}:{children:ReactNode}){
  const{user}=useAuth()
  const loggedIn=!!user

  // 所有数据state（初始化从localStorage读取）
  const[todos,setTodos]=useState<Todo[]>(()=>sanitizeTodos(load(LS_KEYS.todos,[])))
  const[lists,setLists]=useState<TodoList[]>(()=>sanitizeLists(load(LS_KEYS.lists,[])))
  const[categories,setCategories]=useState<Category[]>(()=>sanitizeCategories(load(LS_KEYS.categories,[])))
  const[goals,setGoals]=useState<Goal[]>(()=>sanitizeGoals(load(LS_KEYS.goals,[])))
  const[habits,setHabits]=useState<Habit[]>(()=>sanitizeHabits(load(LS_KEYS.habits,[])))
  const[days,setDays]=useState<ImportantDay[]>(()=>sanitizeDays(load(LS_KEYS.days,[])))
  const[timeBlocks,setTimeBlocks]=useState<TimeBlock[]>(()=>sanitizeTimeBlocks(load(LS_KEYS.timeBlocks,[])))
  const[pomodoros,setPomodoros]=useState<Pomodoro[]>(()=>sanitizePomodoros(load(LS_KEYS.pomodoros,[])))
  const[transactions,setTransactions]=useState<Transaction[]>(()=>sanitizeTransactions(load(LS_KEYS.transactions,[])))
  const[memos,setMemos]=useState<Memo[]>(()=>sanitizeMemos(load(LS_KEYS.memos,[])))
  const[financeCategories,setFinanceCategories]=useState<FinanceCategory[]>(()=>sanitizeFinanceCategories(load(LS_KEYS.financeCategories,[])))
  const[accounts,setAccounts]=useState<Account[]>(()=>sanitizeAccounts(load(LS_KEYS.accounts,[])))
  const[recurrings,setRecurrings]=useState<Recurring[]>(()=>sanitizeRecurrings(load(LS_KEYS.recurrings,[])))

  const[uploading,setUploading]=useState(false)
  const[cloudLoading,setCloudLoading]=useState(false)

  // ========== 本地存储自动保存（无论是否登录都保存本地，作为缓存） ==========
  useEffect(()=>save(LS_KEYS.todos,todos),[todos])
  useEffect(()=>save(LS_KEYS.lists,lists),[lists])
  useEffect(()=>save(LS_KEYS.categories,categories),[categories])
  useEffect(()=>save(LS_KEYS.goals,goals),[goals])
  useEffect(()=>save(LS_KEYS.habits,habits),[habits])
  useEffect(()=>save(LS_KEYS.days,days),[days])
  useEffect(()=>save(LS_KEYS.timeBlocks,timeBlocks),[timeBlocks])
  useEffect(()=>save(LS_KEYS.pomodoros,pomodoros),[pomodoros])
  useEffect(()=>save(LS_KEYS.transactions,transactions),[transactions])
  useEffect(()=>save(LS_KEYS.memos,memos),[memos])
  useEffect(()=>save(LS_KEYS.financeCategories,financeCategories),[financeCategories])
  useEffect(()=>save(LS_KEYS.accounts,accounts),[accounts])
  useEffect(()=>save(LS_KEYS.recurrings,recurrings),[recurrings])

  // ========== 登录时从云端加载数据 ==========
  useEffect(()=>{
    if(!loggedIn||!isCloudMode||!supabase)return
    let cancelled=false
    const loadCloud=async()=>{
      setCloudLoading(true)
      try{
        const [t,l,c,g,h,d,tb,p,tx,m,fc,a,r]=await Promise.all([
          fetchTable('todos'),fetchTable('todo_lists'),fetchTable('categories'),
          fetchTable('goals'),fetchTable('habits'),fetchTable('important_days'),
          fetchTable('time_blocks'),fetchTable('pomodoros'),fetchTable('transactions'),
          fetchTable('memos'),fetchTable('finance_categories'),fetchTable('accounts'),fetchTable('recurrings')
        ])
        if(cancelled)return
        // 云端数据去掉user_id字段后存入本地state
        const strip=(rows:any[])=>rows.map(({user_id,...rest})=>rest)
        setTodos(sanitizeTodos(strip(t)))
        setLists(sanitizeLists(strip(l)))
        setCategories(sanitizeCategories(strip(c)))
        setGoals(sanitizeGoals(strip(g)))
        setHabits(sanitizeHabits(strip(h)))
        setDays(sanitizeDays(strip(d)))
        setTimeBlocks(sanitizeTimeBlocks(strip(tb)))
        setPomodoros(sanitizePomodoros(strip(p)))
        setTransactions(sanitizeTransactions(strip(tx)))
        setMemos(sanitizeMemos(strip(m)))
        setFinanceCategories(sanitizeFinanceCategories(strip(fc)))
        setAccounts(sanitizeAccounts(strip(a)))
        setRecurrings(sanitizeRecurrings(strip(r)))
      }catch(e){console.error('加载云端数据失败:',e)}
      finally{if(!cancelled)setCloudLoading(false)}
    }
    loadCloud()
    return()=>{cancelled=true}
  },[loggedIn])

  // ========== 通用CRUD工厂（带云端同步） ==========
  const mk=<T extends{id:string}>(
    setter:React.Dispatch<React.SetStateAction<T[]>>,
    table:string
  )=>{
    const add=(i:Omit<T,'id'>)=>{
      const newItem={...i,id:uid()}as T
      setter(p=>[...p,newItem])
      if(loggedIn&&isCloudMode)insertRow(table,newItem)
    }
    const update=(id:string,patch:Partial<T>)=>{
      setter(p=>p.map(i=>i.id===id?{...i,...patch}:i))
      if(loggedIn&&isCloudMode)updateRow(table,id,patch)
    }
    const del=(id:string)=>{
      setter(p=>p.filter(i=>i.id!==id))
      if(loggedIn&&isCloudMode)deleteRow(table,id)
    }
    return{add,update,del}
  }

  const t=mk<Todo>(setTodos,'todos')
  const l=mk<TodoList>(setLists,'todo_lists')
  const c=mk<Category>(setCategories,'categories')
  const g=mk<Goal>(setGoals,'goals')
  const h=mk<Habit>(setHabits,'habits')
  const d=mk<ImportantDay>(setDays,'important_days')
  const tb=mk<TimeBlock>(setTimeBlocks,'time_blocks')
  const tr=mk<Transaction>(setTransactions,'transactions')
  const m=mk<Memo>(setMemos,'memos')
  const fc=mk<FinanceCategory>(setFinanceCategories,'finance_categories')
  const ac=mk<Account>(setAccounts,'accounts')
  const rc=mk<Recurring>(setRecurrings,'recurrings')

  const addPomodoro=(p:Omit<Pomodoro,'id'>)=>{
    const newItem={...p,id:uid()}
    setPomodoros(prev=>[...prev,newItem])
    if(loggedIn&&isCloudMode)insertRow('pomodoros',newItem)
  }

  // ========== 习惯打卡时同步对应待办完成 ==========
  const updateHabit=(id:string,patch:Partial<Habit>)=>{
    setHabits(prev=>prev.map(h=>h.id===id?{...h,...patch}:h))
    if(loggedIn&&isCloudMode)updateRow('habits',id,patch)
    if(patch.check_dates){
      const today=dayjs().format('YYYY-MM-DD')
      const checked=patch.check_dates.includes(today)
      setTodos(prev=>prev.map(td=>td.habit_id===id&&td.due_date===today?{...td,completed:checked,completed_at:checked?dayjs().toISOString():undefined}:td))
      // 同步更新云端待办
      if(loggedIn&&isCloudMode){
        const target=todos.find(td=>td.habit_id===id&&td.due_date===today)
        if(target)updateRow('todos',target.id,{completed:checked,completed_at:checked?dayjs().toISOString():null})
      }
    }
  }

  // ========== 待办完成时同步打卡对应习惯 ==========
  const updateTodo=(id:string,patch:Partial<Todo>)=>{
    setTodos(prev=>prev.map(t=>t.id===id?{...t,...patch}:t))
    if(loggedIn&&isCloudMode)updateRow('todos',id,patch)
    if(patch.completed!==undefined){
      const td=todos.find(t=>t.id===id)
      if(td?.habit_id){
        const today=dayjs().format('YYYY-MM-DD')
        if(td.due_date===today){
          setHabits(prev=>prev.map(h=>{
            if(h.id!==td.habit_id)return h
            const has=h.check_dates.includes(today)
            let newCheckDates=h.check_dates
            if(patch.completed&&!has)newCheckDates=[...h.check_dates,today]
            if(!patch.completed&&has)newCheckDates=h.check_dates.filter(d=>d!==today)
            if(loggedIn&&isCloudMode&&newCheckDates!==h.check_dates){
              updateRow('habits',h.id,{check_dates:newCheckDates})
            }
            return{...h,check_dates:newCheckDates}
          }))
        }
      }
    }
  }

  // ========== 习惯同步待办（生成未来7天） ==========
  const syncHabitsToTodos=useCallback(()=>{
    setTodos(prev=>{
      let next=[...prev]
      const today=dayjs()
      for(let i=0;i<7;i++){
        const dt=today.add(i,'day')
        const ds=dt.format('YYYY-MM-DD')
        habits.forEach(hb=>{
          if(!habitDue(hb,dt))return
          const exists=next.some(td=>td.habit_id===hb.id&&td.due_date===ds)
          if(!exists){
            const newTodo:Todo={id:uid(),title:hb.title,priority:'q2',due_date:ds,due_time:'',completed:false,list_id:'inbox',category_id:hb.category_id||'',pinned:false,status:'todo',source:'habit',habit_id:hb.id}
            next.push(newTodo)
            if(loggedIn&&isCloudMode)insertRow('todos',newTodo)
          }
        })
      }
      return next
    })
  },[habits,loggedIn])

  useEffect(()=>{if(habits.length>0)syncHabitsToTodos()},[habits.length,syncHabitsToTodos])

  const deleteHabit=(id:string)=>{
    h.del(id)
    setTodos(prev=>prev.filter(td=>!(td.habit_id===id&&!td.completed)))
    // 云端删除习惯时，同时删除其未完成待办
    if(loggedIn&&isCloudMode){
      todos.filter(td=>td.habit_id===id&&!td.completed).forEach(td=>deleteRow('todos',td.id))
    }
  }

  // ========== 导出/导入/重置 ==========
  const exportAll=()=>JSON.stringify({todos,lists,categories,goals,habits,days,timeBlocks,pomodoros,transactions,memos,financeCategories,accounts,recurrings,v:5},null,2)

  const importAll=(j:string)=>{
    try{
      const raw=JSON.parse(j)
      const d=sanitizeAll(raw)
      if(d.todos)setTodos(d.todos)
      if(d.lists)setLists(d.lists)
      if(d.categories)setCategories(d.categories)
      if(d.goals)setGoals(d.goals)
      if(d.habits)setHabits(d.habits)
      if(d.days)setDays(d.days)
      if(d.timeBlocks)setTimeBlocks(d.timeBlocks)
      if(d.pomodoros)setPomodoros(d.pomodoros)
      if(d.transactions)setTransactions(d.transactions)
      if(d.memos)setMemos(d.memos)
      if(d.financeCategories)setFinanceCategories(d.financeCategories)
      if(d.accounts)setAccounts(d.accounts)
      if(d.recurrings)setRecurrings(d.recurrings)
      alert('导入成功，数据已自动兼容校验')
    }catch{alert('导入失败：文件格式错误')}
  }

  const resetAll=()=>{
    if(confirm('确定清空所有数据？')){
      setTodos([]);setLists(sanitizeLists([]));setCategories(sanitizeCategories([]))
      setGoals([]);setHabits([]);setDays([]);setTimeBlocks([]);setPomodoros([])
      setTransactions([]);setMemos([]);setFinanceCategories(sanitizeFinanceCategories([]))
      setAccounts([]);setRecurrings([])
    }
  }

  // ========== 上传本地数据到云端（带详细错误定位） ==========
  const uploadLocalToCloud=async(skipClear=false)=>{
    if(!loggedIn||!isCloudMode||!supabase)throw new Error('未登录或未配置云端')
    setUploading(true)
    const logs:string[]=[]
    const log=(msg:string)=>{console.log(`[上传] ${msg}`);logs.push(msg)}
    try{
      // 第0步：验证登录状态和用户ID
      log('=== 开始上传 ===')
      const{data:{user}}=await supabase.auth.getUser()
      if(!user)throw new Error('未获取到登录用户信息，请重新登录')
      log(`当前用户ID: ${user.id}`)
      log(`当前用户邮箱: ${user.email}`)

      const tables=['todos','todo_lists','categories','goals','habits','important_days','time_blocks','pomodoros','transactions','memos','finance_categories','accounts','recurrings']
      const dataMap:Record<string,any[]>={todos,lists,categories,goals,habits,days,timeBlocks,pomodoros,transactions,memos,financeCategories,accounts,recurrings}

      // 第1步：清空云端数据（可选跳过，失败也不中断）
      if(!skipClear){
        log('--- 开始清空云端旧数据 ---')
        for(const table of tables){
          try{
            await clearTable(table)
            log(`✓ 清空 ${table} 完成`)
          }catch(e:any){
            // 清空失败不中断，继续插入（表可能是空的，或RLS暂时有问题）
            log(`⚠ 清空 ${table} 失败，跳过继续: ${e.message}`)
          }
        }
      }else{
        log('--- 跳过清空（直接插入） ---')
      }

      // 第2步：批量插入本地数据
      log('--- 开始插入本地数据 ---')
      for(const [key,table] of Object.entries(TABLE_MAP)){
        const rows=dataMap[key]||[]
        if(rows.length===0){log(`- ${table} 无数据，跳过`);continue}
        try{
          await batchInsert(table,rows)
          log(`✓ 插入 ${table} 成功 (${rows.length}条)`)
        }catch(e:any){
          log(`✗ 插入 ${table} 失败: ${e.message}`)
          throw new Error(`插入表 ${table} 失败 (${rows.length}条): ${e.message}\n\n该表数据: ${JSON.stringify(rows.slice(0,2))}...`)
        }
      }

      log('=== 全部上传成功 ===')
      alert('✅ 上传成功！\n\n' + logs.join('\n'))
    }catch(e:any){
      console.error('[上传失败]',e)
      const detail=e.message||String(e)
      alert(`❌ 上传失败\n\n${detail}\n\n--- 详细日志 ---\n${logs.join('\n')}\n\n请把这个弹窗截图发给开发者`)
      throw e
    }finally{setUploading(false)}
  }

  // 测试云端连接
  const testCloudConnection=async()=>{
    if(!supabase){alert('未配置Supabase');return}
    try{
      const{data:{user}}=await supabase.auth.getUser()
      if(!user){alert('未登录');return}
      // 测试查询
      const{data,error}=await supabase.from('todos').select('id').limit(1)
      if(error){
        alert(`❌ 连接测试失败\n\n用户: ${user.email}\n错误: ${error.message}\n\n这说明RLS策略或表结构有问题`)
      }else{
        alert(`✅ 连接测试成功\n\n用户: ${user.email}\n用户ID: ${user.id}\ntodos表查询正常\n\n可以尝试上传数据了`)
      }
    }catch(e:any){
      alert(`❌ 连接测试异常: ${e.message}`)
    }
  }

  return(
    <C.Provider value={{
      todos,addTodo:t.add,updateTodo,deleteTodo:t.del,
      lists,addList:l.add,updateList:l.update,deleteList:l.del,
      categories,addCategory:c.add,updateCategory:c.update,deleteCategory:c.del,
      goals,addGoal:g.add,updateGoal:g.update,deleteGoal:g.del,
      habits,addHabit:h.add,updateHabit,deleteHabit,
      days,addDay:d.add,updateDay:d.update,deleteDay:d.del,
      timeBlocks,addTimeBlock:tb.add,updateTimeBlock:tb.update,deleteTimeBlock:tb.del,
      pomodoros,addPomodoro,
      transactions,addTransaction:tr.add,updateTransaction:tr.update,deleteTransaction:tr.del,
      memos,addMemo:m.add,updateMemo:m.update,deleteMemo:m.del,
      financeCategories,addFinanceCategory:fc.add,updateFinanceCategory:fc.update,deleteFinanceCategory:fc.del,
      accounts,addAccount:ac.add,updateAccount:ac.update,deleteAccount:ac.del,
      recurrings,addRecurring:rc.add,updateRecurring:rc.update,deleteRecurring:rc.del,
      syncHabitsToTodos,exportAll,importAll,resetAll,
      uploadLocalToCloud,testCloudConnection,uploading,cloudLoading
    }}>{children}</C.Provider>
  )
}

export const useData=()=>useContext(C)