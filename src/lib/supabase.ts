import {createClient,SupabaseClient} from '@supabase/supabase-js'

const env=(import.meta as any).env||{}
const url=env.VITE_SUPABASE_URL as string|undefined
const key=env.VITE_SUPABASE_ANON_KEY as string|undefined

// 是否配置了云端（有URL和Key就是云模式）
export const isCloudMode=!!(url&&key)

// Supabase 客户端（未配置时为null）
export const supabase:SupabaseClient|null=isCloudMode?createClient(url!,key!):null

// 开发调试：把supabase暴露到window，方便在浏览器控制台直接测试
if(typeof window!=='undefined'&&supabase){
  (window as any).supabase=supabase
  console.log('%c[Supabase] 已连接，可在控制台使用 window.supabase 测试','color:#10b981;font-weight:bold')
}

// ========== 类型定义 ==========
export type Todo={id:string;title:string;priority:string;due_date?:string;due_time?:string;completed:boolean;list_id:string;category_id?:string;pinned:boolean;status:string;source:string;habit_id?:string;completed_at?:string}
export type TodoList={id:string;name:string;color:string;icon:string}
export type Category={id:string;name:string;color:string}
export type Goal={id:string;title:string;type:string;parent_id?:string;progress:number;status:string;description?:string}
export type Habit={id:string;title:string;frequency:string;custom_days?:number[];check_dates:string[];category_id?:string}
export type ImportantDay={id:string;title:string;date:string;category:string;pinned:boolean;type:'countdown'|'countup'}
export type TimeBlock={id:string;date:string;start:number;end:number;title:string;category:string;source?:string}
export type Pomodoro={id:string;date:string;duration:number;task:string;completed:boolean;mode:string}
export type Transaction={id:string;date:string;type:string;category:string;amount:number;account:string;note?:string}
export type Memo={id:string;title?:string;content:string;category:string;pinned:boolean;completed:boolean;created_at:string}
export type FinanceCategory={id:string;name:string;type:'expense'|'income';color:string;icon:string}
export type Account={id:string;name:string;balance:number;icon:string}
export type Recurring={id:string;name:string;amount:number;cycle:'monthly'|'yearly';day:number;category:string;account:string;start_date:string}

// ========== 云端数据操作辅助函数 ==========
// 所有函数都需要已登录且supabase不为null时才调用

// 获取当前登录用户的ID
export async function getUserId():Promise<string|null>{
  if(!supabase)return null
  const{data:{user}}=await supabase.auth.getUser()
  return user?.id||null
}

// 从云端拉取整张表（自动按user_id过滤，RLS也会兜底）
export async function fetchTable(table:string):Promise<any[]>{
  if(!supabase)return []
  const{data,error}=await supabase.from(table).select('*')
  if(error){console.error(`fetch ${table} error:`,error);return []}
  return data||[]
}

// 插入单行（自动加上user_id，满足RLS的with check）
export async function insertRow(table:string,row:any):Promise<void>{
  if(!supabase)return
  const userId=await getUserId()
  const rowWithUser=userId?{...row,user_id:userId}:row
  const{error}=await supabase.from(table).insert(rowWithUser)
  if(error){console.error(`insert ${table} error:`,error);throw error}
}

// 批量插入（用于上传本地数据，自动给每条加上user_id）
export async function batchInsert(table:string,rows:any[]):Promise<void>{
  if(!supabase||rows.length===0)return
  const userId=await getUserId()
  // 分批，每批500条
  for(let i=0;i<rows.length;i+=500){
    const batch=rows.slice(i,i+500).map(r=>userId?{...r,user_id:userId}:r)
    const{error}=await supabase.from(table).insert(batch)
    if(error){console.error(`batch insert ${table} error:`,error);throw error}
  }
}

// 更新单行
export async function updateRow(table:string,id:string,patch:any):Promise<void>{
  if(!supabase)return
  const{error}=await supabase.from(table).update(patch).eq('id',id)
  if(error)console.error(`update ${table} error:`,error)
}

// 删除单行
export async function deleteRow(table:string,id:string):Promise<void>{
  if(!supabase)return
  const{error}=await supabase.from(table).delete().eq('id',id)
  if(error)console.error(`delete ${table} error:`,error)
}

// 清空当前用户在某张表的所有数据（上传前先清空，避免重复）
// 注意：在 RLS 下不能直接 delete().neq()，必须先查出当前用户的行ID，再按ID删除
export async function clearTable(table:string):Promise<void>{
  if(!supabase)return
  // 第一步：查出当前用户所有行的ID（RLS会自动过滤，只返回当前用户的数据）
  const{data,error:selErr}=await supabase.from(table).select('id')
  if(selErr){console.error(`clear ${table} select error:`,selErr);throw selErr}
  if(!data||data.length===0)return
  // 第二步：按ID批量删除（每批100个，避免URL过长）
  const ids=data.map((r:any)=>r.id)
  for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100)
    const{error:delErr}=await supabase.from(table).delete().in('id',batch)
    if(delErr){console.error(`clear ${table} delete error:`,delErr);throw delErr}
  }
}

// 表名映射（中文键名 -> 数据库表名）
export const TABLE_MAP:Record<string,string>={
  todos:'todos',
  lists:'todo_lists',
  categories:'categories',
  goals:'goals',
  habits:'habits',
  days:'important_days',
  timeBlocks:'time_blocks',
  pomodoros:'pomodoros',
  transactions:'transactions',
  memos:'memos',
  financeCategories:'finance_categories',
  accounts:'accounts',
  recurrings:'recurrings',
}