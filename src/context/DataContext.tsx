import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useState,useCallback,useRef,ReactNode} from 'react'
import {load,save,uid,readRaw,readLegacy,readLegacyText,writeLegacy,writeLegacyText,backupOnce,saveBackup,readBackup,readCloudSyncMeta,writeCloudSyncMeta,clearCloudSyncMeta,BACKUP_KEYS,LOCAL_WORKSPACE_KEY,ACTIVE_OWNER_KEY} from '../core/storage'
import {normalizeLocalData,migrateExtras,buildExportPayload,splitLegacyReviews} from '../core/migrate'
import {sanitizeTodos,sanitizeHabits,sanitizeDays,sanitizeTransactions,sanitizeTimeBlocks,sanitizeGoals,sanitizeMemos,sanitizePomodoros,sanitizeCategories,sanitizeLists,sanitizeFinanceCategories,sanitizeAccounts,sanitizeRecurrings,sanitizeAll} from '../lib/sanitize'
import type{Todo,TodoList,Category,Goal,Habit,ImportantDay,TimeBlock,Pomodoro,Transaction,Memo,FinanceCategory,Account,Recurring,Theme,Quote,GuideEntry,DomainData,DomainKey} from '../core/types'
import {supabase,isCloudMode,insertRow,updateRow,deleteRow,batchInsert,clearTable,TABLE_MAP,fetchAllTablesStrict,getDroppedColumns} from '../lib/supabase'
import {CLOUD_DOMAINS,CLOUD_TABLES,inspectLocal,mergeCloudIntoLocal,buildCloudSignature,decideCloudAction,IDLE_CLOUD_STATE} from '../core/cloudSync'
import type{CloudUiState,CloudPayload} from '../core/cloudSync'
import {useAuth} from './AuthContext'
import {buildHabitTodoPlan,periodRange} from '../features/habits/habitSchedule'
import type{HabitTodoPlanItem} from '../features/habits/habitSchedule'
import {BUILTIN_QUOTES} from '../features/quotes/builtinQuotes'
import {QUOTES_SEEDED_KEY,QUOTES_SEED_VERSION,seedBuiltinQuotes} from '../features/quotes/quotes'
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
  /** [M1-19] 本地词库：不进 DomainData / 13 域 / latestRef，云端未接入 */
  quotes:Quote[]
  syncHabitsToTodos:()=>void
  exportAll:()=>string;importAll:(j:string)=>void;resetAll:()=>void
  uploadLocalToCloud:(skipClear?:boolean,options?:{skipSnapshot?:boolean})=>Promise<void>
  testCloudConnection:()=>Promise<void>
  uploading:boolean
  cloudLoading:boolean
  /** 云同步 UI 状态：判断"云端为空 / 读取失败 / 两边都有" */
  cloud:CloudUiState
  /** 处理云端弹窗：合并（云端赢）/ 用本机覆盖云端 / 稍后 */
  resolveCloud:(choice:'merge'|'overwrite'|'skip')=>Promise<void>
  retryCloud:()=>void
  dismissCloudNotice:()=>void
  /** 强制把当前云端 13 表快照写入本地备份；失败会抛错（覆盖前必调） */
  createCloudSnapshot:(reason:string)=>Promise<void>
  /** 登录/注册提交前调用：把当前本地 13 域写入工作区快照（登出时恢复到这里） */
  snapshotLocalWorkspace:()=>void
}

const C=createContext<Ctx>({} as Ctx)

// 本地存储的key
const LS_KEYS={
  todos:'p_todos',lists:'p_lists',categories:'p_cats',goals:'p_goals',
  habits:'p_habits',days:'p_days',timeBlocks:'p_time',pomodoros:'p_pomo',
  transactions:'p_tx',memos:'p_memos',financeCategories:'p_fc',accounts:'p_accts',recurrings:'p_rec'
}

// 6 个仅本地实体仍在使用的旧 key（页面直接读 localStorage，保持原样）
const EXTRA_KEYS=['p_themes','p_daily_reviews','p_weekly_reviews','p_monthly_reviews','p_yearly_reviews','p_disabled','p_nick','p_avatar'] as const

/**
 * localStorage 初始化：
 * 1. 读取原始快照（新命名空间 → 旧 key）
 * 2. 迁移前把原始快照写入独立备份 key，只写一次，绝不覆盖
 * 3. sanitize（兜底占位）→ migrate（唯一出口），返回最终结果
 */
function readInitialLocalData(){
  const domains:Record<string,unknown>={}
  for(const[domain,key]of Object.entries(LS_KEYS))domains[domain]=readRaw(key)
  const extras:Record<string,unknown>={}
  for(const key of EXTRA_KEYS){
    // p_nick / p_avatar 在页面里是裸字符串，不是 JSON
    extras[key]=(key==='p_nick'||key==='p_avatar')?readLegacyText(key,''):readRaw(key)
  }

  backupOnce(BACKUP_KEYS.local,{
    savedAt:new Date().toISOString(),
    note:'首次接入 migrate 前的原始快照，仅保留这一份',
    domains,
    extras,
  })

  return normalizeLocalData(domains).data
}

/** 读取 6 个本地实体（导出时实时读取，避免与 ThemeContext / ReviewPage 形成双份状态） */
function readLocalExtras(){
  const reviewsOf=(key:string,period:'daily'|'weekly'|'monthly'|'yearly')=>{
    const list=readRaw(key)
    return Array.isArray(list)
      ?list.filter(item=>!!item&&typeof item==='object').map(item=>({period_type:period,...(item as Record<string,unknown>)}))
      :[]
  }
  return migrateExtras({
    reviews:[
      ...reviewsOf('p_daily_reviews','daily'),
      ...reviewsOf('p_weekly_reviews','weekly'),
      ...reviewsOf('p_monthly_reviews','monthly'),
      ...reviewsOf('p_yearly_reviews','yearly'),
    ],
    themes:load<Theme[]>('p_themes',[]),
    quotes:load<Quote[]>('p_quotes',[]),
    guides:load<GuideEntry[]>('p_guides',[]),
    settings:{disabledModules:readLegacy('p_disabled',[])},
    user:{id:'local',nickname:readLegacyText('p_nick',''),avatar:readLegacyText('p_avatar','')},
  })
}

/** 仅当导入文件确实包含对应字段时才写回，避免旧文件（没有 extras）把现有数据清空 */
function hasKey(source:Record<string,unknown>,keys:string[]){
  return keys.some(key=>Object.prototype.hasOwnProperty.call(source,key))
}

/** 云端行 → 本地行：去掉 user_id；备忘录 created_at 为空时用 inserted_at 兜底（旧数据兼容） */
function normalizeCloudRows(key:DomainKey,rows:any[]):any[]{
  if(!Array.isArray(rows))return []
  return rows.map(row=>{
    if(!row||typeof row!=='object')return row
    const{user_id,...rest}=row as Record<string,any>
    if(key==='memos'&&!rest.created_at&&rest.inserted_at)rest.created_at=rest.inserted_at
    return rest
  })
}

// ========== [M1-5] 账号切换 / 本地工作区快照 ==========
/** 登录前的本地工作区快照；缺失或损坏时回落到种子数据（绝不返回空数组） */
function readLocalWorkspace():DomainData{
  const saved=readBackup<{savedAt?:string;domains?:DomainData}>(LOCAL_WORKSPACE_KEY)
  const domains=saved?.domains
  if(domains&&typeof domains==='object')return sanitizeAll(domains) as DomainData
  return sanitizeAll({}) as DomainData
}

/** p_* 缓存当前属于谁：'local' 或 userId */
const readOwner=()=>readLegacyText(ACTIVE_OWNER_KEY,'local')
const writeOwner=(value:string)=>writeLegacyText(ACTIVE_OWNER_KEY,value)

export function DataProvider({children}:{children:ReactNode}){
  const{user,loading:authLoading,recoveryMode}=useAuth()
  const loggedIn=!!user

  // 所有数据state（初始化统一走 readInitialLocalData：备份 → sanitize → migrate）
  const[initial]=useState(readInitialLocalData)
  const[todos,setTodos]=useState<Todo[]>(initial.todos)
  const[lists,setLists]=useState<TodoList[]>(initial.lists)
  const[categories,setCategories]=useState<Category[]>(initial.categories)
  const[goals,setGoals]=useState<Goal[]>(initial.goals)
  const[habits,setHabits]=useState<Habit[]>(initial.habits)
  const[days,setDays]=useState<ImportantDay[]>(initial.days)
  const[timeBlocks,setTimeBlocks]=useState<TimeBlock[]>(initial.timeBlocks)
  const[pomodoros,setPomodoros]=useState<Pomodoro[]>(initial.pomodoros)
  const[transactions,setTransactions]=useState<Transaction[]>(initial.transactions)
  const[memos,setMemos]=useState<Memo[]>(initial.memos)
  const[financeCategories,setFinanceCategories]=useState<FinanceCategory[]>(initial.financeCategories)
  const[accounts,setAccounts]=useState<Account[]>(initial.accounts)
  const[recurrings,setRecurrings]=useState<Recurring[]>(initial.recurrings)
  // [M1-19] 每日一句词库：本地实体，独立于 13 域与云端
  const[quotes,setQuotes]=useState<Quote[]>(()=>load<Quote[]>('p_quotes',[]))

  const[uploading,setUploading]=useState(false)
  const[cloudLoading,setCloudLoading]=useState(false)
  // 云同步 UI 状态：与"云端到底读没读到"严格绑定，读取失败绝不进入任何覆盖分支
  const[cloud,setCloud]=useState<CloudUiState>(IDLE_CLOUD_STATE)
  const[reloadToken,setReloadToken]=useState(0)
  // 最近一次成功读取的云端数据（合并时使用）
  const cloudRef=useRef<CloudPayload>({})
  // 最新的本地 13 域（effect 里不能直接依赖 13 个 state，否则每次输入都会重跑云端检查）
  const latestRef=useRef<DomainData>({} as DomainData)
  // [M1-19] 内置词库一次性灌入：标记存在即不再灌（用户删光也不回填）；
  // 词库非空时只按 id 补缺失，不覆盖用户数据。仅挂载执行一次，不参与 13 域保存链路。
  useEffect(()=>{
    const seeded=!!load<unknown>(QUOTES_SEEDED_KEY,null)
    const result=seedBuiltinQuotes(quotes,BUILTIN_QUOTES,seeded)
    if(result.changed){
      setQuotes(result.quotes)
      save('p_quotes',result.quotes)
    }
    if(!seeded)save(QUOTES_SEEDED_KEY,QUOTES_SEED_VERSION)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // [M1-5] 登出恢复期间暂停 13 个本地保存 effect，防止把恢复过程写脏
  const persistSuspendedRef=useRef(false)
  // [M1-5] 上一次的用户 id：用来识别"退出登录"这一状态迁移
  const prevUserIdRef=useRef<string|null>(user?.id||null)
  // [M1-5] 每次登出恢复 +1，触发解锁 effect
  const[persistEpoch,setPersistEpoch]=useState(0)
  useEffect(()=>{
    latestRef.current={todos,lists,categories,goals,habits,days,timeBlocks,pomodoros,transactions,memos,financeCategories,accounts,recurrings}
  })
  // [MIGRATE-ANCHOR:init] 已启用：readInitialLocalData() 内完成"备份原始快照 → sanitize → migrate"

  /** 把 13 域写回 state（统一走 sanitize，避免云端裸数据绕过规范化） */
  const applyDomainData=useCallback((d:DomainData)=>{
    setTodos(sanitizeTodos(d.todos))
    setLists(sanitizeLists(d.lists))
    setCategories(sanitizeCategories(d.categories))
    setGoals(sanitizeGoals(d.goals))
    setHabits(sanitizeHabits(d.habits))
    setDays(sanitizeDays(d.days))
    setTimeBlocks(sanitizeTimeBlocks(d.timeBlocks))
    setPomodoros(sanitizePomodoros(d.pomodoros))
    setTransactions(sanitizeTransactions(d.transactions))
    setMemos(sanitizeMemos(d.memos))
    setFinanceCategories(sanitizeFinanceCategories(d.financeCategories))
    setAccounts(sanitizeAccounts(d.accounts))
    setRecurrings(sanitizeRecurrings(d.recurrings))
  },[])

  /** [M1-5] 登录/注册前调用：把当前本地 13 域写入工作区快照，登出时恢复到这里 */
  const snapshotLocalWorkspace=useCallback(()=>{
    saveBackup(LOCAL_WORKSPACE_KEY,{savedAt:new Date().toISOString(),domains:latestRef.current})
  },[])

  // ========== [M1-5] 登出 / 冷启动：恢复登录前的本地工作区 ==========
  // 用 useLayoutEffect 保证在 13 个保存 effect 之前执行；四层保护的顺序不可调整。
  useLayoutEffect(()=>{
    const currentId=user?.id||null
    const prevId=prevUserIdRef.current
    prevUserIdRef.current=currentId

    // 已登录：校正 owner，并释放可能残留的锁（切号后新的 setState 必须能正常保存）
    if(currentId){
      persistSuspendedRef.current=false
      if(readOwner()!==currentId)writeOwner(currentId)
      return
    }
    if(authLoading)return

    // 两种情况需要恢复：刚退出登录；或冷启动发现 p_* 是上一个账号的缓存
    const loggedOut=!!prevId
    const foreignOwner=readOwner()!=='local'
    if(!loggedOut&&!foreignOwner)return

    // 第 1 层：先上锁（必须在任何 setState 之前）
    persistSuspendedRef.current=true

    // 登出：清掉云端判定状态，避免同一账号重登时被签名静默跳过
    clearCloudSyncMeta()
    cloudRef.current={}
    setCloud(IDLE_CLOUD_STATE)
    setCloudLoading(false)

    // 第 2 层：恢复工作区快照（缺失回落到种子数据，绝不回落 []）
    const workspace=readLocalWorkspace()
    applyDomainData(workspace)

    // 第 3 层：同步直写 13 域，保证内存 / localStorage / owner 三者一致
    for(const[domain,key]of Object.entries(LS_KEYS))save(key,(workspace as any)[domain])

    writeOwner('local')
    // 第 4 层：解锁交给下方 persistEpoch effect（必须声明在 13 个保存 effect 之后）
    setPersistEpoch(n=>n+1)
  },[user?.id,authLoading,applyDomainData])

  // ========== 本地存储自动保存（无论是否登录都保存本地，作为缓存） ==========
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.todos,todos)},[todos])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.lists,lists)},[lists])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.categories,categories)},[categories])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.goals,goals)},[goals])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.habits,habits)},[habits])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.days,days)},[days])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.timeBlocks,timeBlocks)},[timeBlocks])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.pomodoros,pomodoros)},[pomodoros])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.transactions,transactions)},[transactions])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.memos,memos)},[memos])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.financeCategories,financeCategories)},[financeCategories])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.accounts,accounts)},[accounts])
  useEffect(()=>{if(persistSuspendedRef.current)return;save(LS_KEYS.recurrings,recurrings)},[recurrings])

  // [M1-5] 第 4 层：解锁。必须声明在 13 个保存 effect 之后，
  // 保证同一 commit 中保存 effect 先看到锁，随后才解锁。
  useEffect(()=>{persistSuspendedRef.current=false},[persistEpoch])

  // ========== 登录后检查云端（严格区分"读取失败"与"云端为空"） ==========
  useEffect(()=>{
    const userId=user?.id
    if(!userId||!isCloudMode||!supabase||recoveryMode){
      // [M1-5] 重置密码期间不判定云端：不弹 CloudSyncGate，也不覆盖本地数据
      setCloud(IDLE_CLOUD_STATE)
      return
    }
    // 上传过程中不检查，避免读到"清空中"的中间态；上传结束会自动重跑
    if(uploading){
      setCloudLoading(false)
      return
    }

    let cancelled=false
    setCloudLoading(true)
    ;(async()=>{
      try{
        setCloud(prev=>({...prev,phase:'checking',failedTables:[]}))
        const{ok,data,failed}=await fetchAllTablesStrict([...CLOUD_TABLES])
        if(cancelled)return

        const payload:CloudPayload={}
        for(const{key,table}of CLOUD_DOMAINS)payload[key]=normalizeCloudRows(key,data[table]||[])
        // 只有读取成功才更新 cloudRef（合并/覆盖时使用），失败时保留上一次成功快照
        if(ok)cloudRef.current=payload

        const decision=decideCloudAction({
          ok,
          failed,
          cloud:payload,
          local:latestRef.current,
          meta:readCloudSyncMeta(),
          userId,
        })

        switch(decision.kind){
          case 'error':
            setCloud({phase:'error',failedTables:decision.failed,counts:decision.counts,message:decision.message})
            return
          case 'offer-upload':
            setCloud({phase:'offer-upload',failedTables:[],counts:decision.counts})
            return
          case 'idle':
            setCloud({phase:'idle',failedTables:[],counts:decision.counts})
            return
          case 'pull':
            applyDomainData(decision.data)
            writeCloudSyncMeta({userId,cloudSignature:decision.signature,at:new Date().toISOString()})
            setCloud({phase:'idle',failedTables:[],counts:decision.counts})
            return
          case 'conflict':
            setCloud({phase:'conflict',failedTables:[],counts:decision.counts,merge:decision.merge})
            return
        }
      }finally{
        if(!cancelled)setCloudLoading(false)
      }
    })().catch(e=>{
      if(cancelled)return
      console.error('[云同步] 检查云端失败:',e)
      setCloud({phase:'error',failedTables:[],counts:inspectLocal(latestRef.current).counts,message:e?.message||'云端读取失败'})
    })
    return()=>{cancelled=true}
  },[user?.id,uploading,reloadToken,recoveryMode,applyDomainData])

  /** 强制抓取云端 13 表快照并写入本地备份；不完整或写不进就抛错（覆盖前必调） */
  const createCloudSnapshot=async(reason:string)=>{
    if(!isCloudMode||!supabase)throw new Error('未配置云端，无法创建快照')
    const{ok,data,failed}=await fetchAllTablesStrict([...CLOUD_TABLES])
    const written=saveBackup(BACKUP_KEYS.cloudBeforeOverwrite,{
      savedAt:new Date().toISOString(),
      reason,
      complete:ok,
      failedTables:failed,
      tables:data,
    })
    if(!written)throw new Error('云端快照写入失败（浏览器存储可能已满），已中止覆盖操作')
    if(!ok)throw new Error(`云端快照不完整（失败表：${failed.join('、')}），已中止覆盖操作`)
  }

  /** 处理云同步弹窗：合并（云端赢）/ 用本机覆盖云端 / 稍后 */
  const resolveCloud=async(choice:'merge'|'overwrite'|'skip')=>{
    const userId=user?.id
    if(!userId)return
    if(choice==='skip'){
      setCloud(IDLE_CLOUD_STATE)
      return
    }
    if(choice==='merge'){
      const merged=mergeCloudIntoLocal(latestRef.current,cloudRef.current)
      applyDomainData(sanitizeAll(merged.data) as DomainData)
      writeCloudSyncMeta({userId,cloudSignature:buildCloudSignature(cloudRef.current),at:new Date().toISOString()})
      setCloud(IDLE_CLOUD_STATE)
      return
    }
    // 覆盖前先强制写云端快照，快照不完整直接中止（不弹"失败"以外的任何分支）
    await createCloudSnapshot('manual-overwrite')
    await uploadLocalToCloud(false,{skipSnapshot:true})
    setCloud(IDLE_CLOUD_STATE)
  }

  const retryCloud=()=>{
    setCloud(prev=>({...prev,phase:'checking',failedTables:[]}))
    setReloadToken(n=>n+1)
  }

  const dismissCloudNotice=()=>setCloud(IDLE_CLOUD_STATE)

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
      // 只有"今日打卡状态"真的变化时才回写今日待办；
      // 补/取消过去或未来日期的打卡不应连带改动今天的习惯待办
      const before=habits.find(h=>h.id===id)?.check_dates.includes(today)??false
      const checked=patch.check_dates.includes(today)
      if(before===checked)return
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

  // ========== 习惯待办重算（M1-13） ==========
  // TODO(M1 末，SQL 侧统一补)：`(user_id, habit_id, due_date)` 唯一索引。
  // 本批只用内存去重保证不产生重复待办；云端表尚未加唯一约束。
  // TODO(M2/M3)：目前 check_dates: string[] 只支持"一天最多一次打卡"。
  // 若未来要支持"每天 N 次"（如每天 8 杯水），需要把 check_dates 改成
  // `{date, count}[]` 或嵌套数组，并同步迁移历史数据。
  /**
   * 只包含"影响排期 / 标题 / 分类"的字段，check_dates 刻意排除。
   * 打卡会改 habits 数组但不会改这个 key，因此不会触发待办重算，
   * 从根源上切断 打卡 → setHabits → 重算 → setTodos 的连锁。
   */
  const habitPlanKey=useMemo(
    ()=>habits.map(hb=>[hb.id,hb.title,hb.frequency,(hb.custom_days||[]).join('.'),hb.category_id||'',hb.target_count??'',hb.target_period??'',hb.monthly_day??''].join('|')).join('~'),
    [habits]
  )

  /**
   * 与现有待办做 diff：
   * - 新增：计划内有、现有无（按 habit_id + due_date 去重，内存 Set 防重）
   * - 删除：本习惯当前重算窗口 [周期起点, 今天+6] 内、未完成、且已不在计划里
   *   （频率变更后旧生成物一并作废，标题被改过也删，这是已确认的行为）
   * - 已完成待办一律保留
   * - 无变化直接 return，不调用 setTodos，避免无意义重渲染
   */
  const reconcileHabitTodos=useCallback((plan:HabitTodoPlanItem[],today:string)=>{
    const current=latestRef.current.todos
    const planned=latestRef.current.habits
    const end=dayjs(today).add(6,'day').format('YYYY-MM-DD')
    const desired=new Set(plan.map(item=>`${item.habitId}|${item.dueDate}`))
    const windows=new Map<string,{start:string;end:string}>()
    planned.forEach(hb=>windows.set(hb.id,{start:periodRange(hb,today).start,end}))

    const next:Todo[]=[]
    const kept=new Set<string>()
    current.forEach(todo=>{
      const key=todo.habit_id&&todo.due_date?`${todo.habit_id}|${todo.due_date}`:''
      if(key)kept.add(key)
      const win=todo.habit_id?windows.get(todo.habit_id):undefined
      const removable=!!win&&!todo.completed&&!!todo.due_date&&todo.due_date>=win.start&&todo.due_date<=win.end&&!desired.has(key)
      if(removable){
        if(loggedIn&&isCloudMode)deleteRow('todos',todo.id)
        return
      }
      next.push(todo)
    })

    plan.forEach(item=>{
      const key=`${item.habitId}|${item.dueDate}`
      if(kept.has(key))return
      const newTodo:Todo={id:uid(),title:item.title,quadrant:'q2',due_date:item.dueDate,due_time:'',completed:false,list_id:'inbox',category_id:item.categoryId||'',pinned:false,status:'todo',source:'habit',habit_id:item.habitId}
      next.push(newTodo)
      kept.add(key)
      if(loggedIn&&isCloudMode)insertRow('todos',newTodo)
    })

    const unchanged=next.length===current.length&&next.every((todo,index)=>todo===current[index])
    if(!unchanged)setTodos(next)
  },[loggedIn])

  const syncHabitsToTodos=useCallback(()=>{
    const today=dayjs().format('YYYY-MM-DD')
    const currentHabits=latestRef.current.habits
    if(!currentHabits.length)return
    reconcileHabitTodos(buildHabitTodoPlan(currentHabits,today,6),today)
  },[reconcileHabitTodos])

  // 只依赖 habitPlanKey：频率/目标/标题/分类变化才重算；打卡不改 key，不会触发
  useEffect(()=>{syncHabitsToTodos()},[habitPlanKey,syncHabitsToTodos])

  const deleteHabit=(id:string)=>{
    const linkedTodos=todos.filter(td=>td.habit_id===id)
    const removeTodos=linkedTodos.filter(td=>!td.completed)
    const unbindTodos=linkedTodos.filter(td=>td.completed)
    // 时间块代表真实发生的时间，不随习惯删除而消失；只解绑指向该习惯的引用
    const linkedBlocks=timeBlocks.filter(tb=>tb.ref_type==='habit'&&tb.ref_id===id)

    h.del(id)
    if(removeTodos.length||unbindTodos.length){
      const removeIds=new Set(removeTodos.map(td=>td.id))
      const unbindIds=new Set(unbindTodos.map(td=>td.id))
      setTodos(prev=>prev
        .filter(td=>!removeIds.has(td.id))
        .map(td=>unbindIds.has(td.id)?{...td,habit_id:undefined}:td))
    }
    if(linkedBlocks.length){
      const blockIds=new Set(linkedBlocks.map(tb=>tb.id))
      setTimeBlocks(prev=>prev.map(tb=>blockIds.has(tb.id)?{...tb,ref_type:undefined,ref_id:undefined}:tb))
    }
    if(loggedIn&&isCloudMode){
      removeTodos.forEach(td=>deleteRow('todos',td.id))
      unbindTodos.forEach(td=>updateRow('todos',td.id,{habit_id:null}))
      linkedBlocks.forEach(tb=>updateRow('time_blocks',tb.id,{ref_type:null,ref_id:null}))
    }
  }

  // ========== 导出/导入/重置 ==========
  const exportAll=()=>{
    const data={todos,lists,categories,goals,habits,days,timeBlocks,pomodoros,transactions,memos,financeCategories,accounts,recurrings}
    // 13 域 + 6 个本地实体，带 schemaVersion；同时保留 v:5 让旧版本仍能导入
    return JSON.stringify(buildExportPayload(data,readLocalExtras()),null,2)
  }

  const importAll=(j:string)=>{
    try{
      const raw=JSON.parse(j)
      const source:Record<string,unknown>=raw&&typeof raw==='object'
        ?((raw.data&&typeof raw.data==='object')?raw.data as Record<string,unknown>:raw as Record<string,unknown>)
        :{}
      // [MIGRATE-ANCHOR:import] 已启用：导入前先备份原始 JSON（只保留最近一份），再 sanitize → migrate
      saveBackup(BACKUP_KEYS.import,raw)
      const result=normalizeLocalData(raw)
      const d=result.data
      setTodos(d.todos)
      setLists(d.lists)
      setCategories(d.categories)
      setGoals(d.goals)
      setHabits(d.habits)
      setDays(d.days)
      setTimeBlocks(d.timeBlocks)
      setPomodoros(d.pomodoros)
      setTransactions(d.transactions)
      setMemos(d.memos)
      setFinanceCategories(d.financeCategories)
      setAccounts(d.accounts)
      setRecurrings(d.recurrings)

      // 6 个本地实体：只有导入文件确实带有对应字段时才写回
      const extras=migrateExtras(raw)
      if(hasKey(source,['reviews','p_daily_reviews','p_weekly_reviews','p_monthly_reviews','p_yearly_reviews'])){
        const legacy=splitLegacyReviews(extras.reviews)
        writeLegacy('p_daily_reviews',legacy.daily)
        writeLegacy('p_weekly_reviews',legacy.weekly)
        writeLegacy('p_monthly_reviews',legacy.monthly)
        writeLegacy('p_yearly_reviews',legacy.yearly)
      }
      if(hasKey(source,['themes']))save('p_themes',extras.themes)
      // [M1-19] quotes 是 DataContext 内的状态，导入后必须同步内存，否则页面仍显示旧词库
      if(hasKey(source,['quotes'])){
        save('p_quotes',extras.quotes)
        setQuotes(extras.quotes)
      }
      if(hasKey(source,['guides']))save('p_guides',extras.guides)
      if(hasKey(source,['settings','p_disabled','disabledModules'])){
        writeLegacy('p_disabled',extras.settings.disabledModules||[])
      }
      if(hasKey(source,['user','user_meta','p_nick','p_avatar'])){
        if(extras.user.nickname!==undefined)writeLegacyText('p_nick',extras.user.nickname)
        if(extras.user.avatar!==undefined)writeLegacyText('p_avatar',extras.user.avatar)
      }

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
  const uploadLocalToCloud=async(skipClear=false,options:{skipSnapshot?:boolean}={})=>{
    if(!loggedIn||!isCloudMode||!supabase)throw new Error('未登录或未配置云端')
    setUploading(true)
    const logs:string[]=[]
    const log=(msg:string)=>{console.log(`[上传] ${msg}`);logs.push(msg)}
    try{
      // 第0步：验证登录状态和用户ID
      log('=== 开始上传 ===')
      const{data:{user:authUser}}=await supabase.auth.getUser()
      if(!authUser)throw new Error('未获取到登录用户信息，请重新登录')
      // [M1-5] 登出/切号瞬间可能仍有旧上传在跑：账号不一致直接中止，绝不把旧账号数据写进新账号
      if(authUser.id!==user?.id)throw new Error('登录账号已变化，已中止上传以保护数据')
      log(`当前用户ID: ${authUser.id}`)
      log(`当前用户邮箱: ${authUser.email}`)

      const tables=['todos','todo_lists','categories','goals','habits','important_days','time_blocks','pomodoros','transactions','memos','finance_categories','accounts','recurrings']
      const dataMap:Record<string,any[]>={todos,lists,categories,goals,habits,days,timeBlocks,pomodoros,transactions,memos,financeCategories,accounts,recurrings}

      // 第0.5步：清空前先抓云端快照（失败直接中止，避免"覆盖后无法回退"）
      if(!skipClear&&!options.skipSnapshot){
        log('--- 抓取云端快照（覆盖前可回退）---')
        try{
          await createCloudSnapshot('uploadLocalToCloud')
          log('✓ 云端快照已写入本地备份')
        }catch(e:any){
          throw new Error(`云端快照失败，已中止上传：${e.message}`)
        }
      }

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

      // 记录本次已处理的云端状态，避免上传完立刻又弹"两边都有"
      writeCloudSyncMeta({
        userId:authUser.id,
        cloudSignature:buildCloudSignature(dataMap as unknown as CloudPayload),
        at:new Date().toISOString(),
      })

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
      const{data:{user:authUser}}=await supabase.auth.getUser()
      if(!authUser){alert('未登录');return}
      // 测试查询
      const{data,error}=await supabase.from('todos').select('id').limit(1)
      if(error){
        alert(`❌ 连接测试失败\n\n用户: ${authUser.email}\n错误: ${error.message}\n\n这说明RLS策略或表结构有问题`)
      }else{
        const dropped=getDroppedColumns()
        const droppedText=Object.keys(dropped).length
          ?`\n\n⚠ 本次会话因云端缺列被跳过的字段：\n${JSON.stringify(dropped,null,2)}\n请执行 supabase_schema.sql 更新表结构`
          :''
        alert(`✅ 连接测试成功\n\n用户: ${authUser.email}\n用户ID: ${authUser.id}\ntodos表查询正常\n\n可以尝试上传数据了${droppedText}`)
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
      quotes,
      syncHabitsToTodos,exportAll,importAll,resetAll,
      uploadLocalToCloud,testCloudConnection,uploading,cloudLoading,
      cloud,resolveCloud,retryCloud,dismissCloudNotice,createCloudSnapshot,snapshotLocalWorkspace
    }}>{children}</C.Provider>
  )
}

export const useData=()=>useContext(C)