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

// 类型定义已收口到 src/core/types.ts（单一真源）

// ========== 云端数据操作辅助函数 ==========
// 所有函数都需要已登录且supabase不为null时才调用

// 获取当前登录用户的ID
export async function getUserId():Promise<string|null>{
  if(!supabase)return null
  const{data:{user}}=await supabase.auth.getUser()
  return user?.id||null
}

// 从云端拉取整张表（宽松版：出错返回空数组，无法区分"网络失败"与"云端为空"）
// @deprecated 云同步判定请使用 fetchTableStrict / fetchAllTablesStrict，避免把失败当成空数据
export async function fetchTable(table:string):Promise<any[]>{
  if(!supabase)return []
  const{data,error}=await supabase.from(table).select('*')
  if(error){console.error(`fetch ${table} error:`,error);return []}
  return data||[]
}

/** 读取失败（网络 / RLS / 表不存在 / 返回非数组），必须与"云端为空"严格区分 */
export class CloudReadError extends Error{
  table:string
  code?:string
  constructor(table:string,message:string,code?:string,cause?:unknown){
    super(message)
    this.name='CloudReadError'
    this.table=table
    this.code=code
    ;(this as any).cause=cause
  }
}

/** 严格读取单表：任何 error 一律抛出，绝不静默返回 [] */
export async function fetchTableStrict(table:string):Promise<any[]>{
  if(!supabase)throw new CloudReadError(table,'Supabase 未配置')
  const{data,error}=await supabase.from(table).select('*')
  if(error)throw new CloudReadError(table,error.message,error.code,error)
  if(!Array.isArray(data))throw new CloudReadError(table,'云端返回的数据不是数组')
  return data
}

/**
 * 并发读取多表：保留成功表供排查，但只要有一张失败就 ok=false。
 * 调用方在 ok=false 时必须保持本地数据不变。
 */
export async function fetchAllTablesStrict(tables:string[]):Promise<{ok:boolean;data:Record<string,any[]>;failed:string[]}>{
  const results=await Promise.allSettled(tables.map(t=>fetchTableStrict(t)))
  const data:Record<string,any[]>={}
  const failed:string[]=[]
  results.forEach((result,index)=>{
    const table=tables[index]
    if(result.status==='fulfilled')data[table]=result.value
    else{
      failed.push(table)
      console.error(`[云同步] 读取表 ${table} 失败:`,result.reason)
    }
  })
  return{ok:failed.length===0,data,failed}
}

/** PostgREST 未知列 / 缺表错误判定 */
export function isMissingColumnError(error:any):boolean{
  const code=error?.code
  const message=String(error?.message||'')
  return code==='PGRST204'||code==='42703'||/Could not find the '.+' column/i.test(message)||/column .+ does not exist/i.test(message)
}

/** 从错误信息里解析列名（解析不出来返回 null） */
export function extractMissingColumn(error:any):string|null{
  const message=String(error?.message||'')
  const matched=message.match(/Could not find the '([^']+)' column/i)||message.match(/column "?([A-Za-z0-9_]+)"? does not exist/i)
  return matched?matched[1]:null
}

/** 本次会话中因云端缺列而被跳过的字段（仅内存，刷新页面后自动恢复） */
const droppedColumns=new Map<string,Set<string>>()
const MAX_COLUMN_RETRY=10

export function getDroppedColumns():Record<string,string[]>{
  const result:Record<string,string[]>={}
  droppedColumns.forEach((columns,table)=>{result[table]=[...columns]})
  return result
}

export function clearDroppedColumns():void{
  droppedColumns.clear()
}

const hasOwn=(target:Record<string,unknown>,key:string)=>Object.prototype.hasOwnProperty.call(target,key)

const filterDropped=(table:string,row:any):any=>{
  const dropped=droppedColumns.get(table)
  if(!dropped||dropped.size===0)return row
  const copy={...row}
  dropped.forEach(column=>{delete copy[column]})
  return copy
}

const markDropped=(table:string,column:string):void=>{
  let set=droppedColumns.get(table)
  if(!set){set=new Set();droppedColumns.set(table,set)}
  if(set.has(column))return
  set.add(column)
  // 该文案会直接出现在用户控制台里，必须让人看懂发生了什么、下一步做什么
  console.warn(`[云同步] 云端结构未更新，已自动丢弃字段 ${column}（表 ${table}），本次不会写入该字段。请尽快执行 supabase_schema.sql 更新数据库结构。`)
}


/**
 * 执行一次写入；若云端缺少字段（PGRST204），裁掉该字段后重试。
 * 用于 SQL 尚未执行、表结构仍是旧版的过渡期：新字段写不进去，但旧字段照常同步，绝不整批失败。
 */
async function writeWithColumnFallback(
  table:string,
  rows:any[],
  exec:(payload:any[])=>PromiseLike<{error:any}>
):Promise<void>{
  let payload=rows.map(row=>filterDropped(table,row))
  for(let attempt=0;attempt<=MAX_COLUMN_RETRY;attempt++){
    const{error}=await exec(payload)
    if(!error)return
    const column=isMissingColumnError(error)?extractMissingColumn(error):null
    if(!column||!payload.some(row=>hasOwn(row,column))){
      console.error(`insert ${table} error:`,error)
      throw error
    }
    markDropped(table,column)
    payload=rows.map(row=>filterDropped(table,row))
  }
  throw new Error(`写入表 ${table} 失败：连续 ${MAX_COLUMN_RETRY} 次因云端缺少字段被拒绝，请先执行 supabase_schema.sql 更新结构`)
}

// 插入单行（自动加上user_id，满足RLS的with check）
export async function insertRow(table:string,row:any):Promise<void>{
  if(!supabase)return
  const userId=await getUserId()
  const rowWithUser=userId?{...row,user_id:userId}:row
  await writeWithColumnFallback(table,[rowWithUser],async payload=>{
    const{error}=await supabase!.from(table).insert(payload)
    return{error}
  })
}

// 批量插入（用于上传本地数据，自动给每条加上user_id）
export async function batchInsert(table:string,rows:any[]):Promise<void>{
  if(!supabase||rows.length===0)return
  const userId=await getUserId()
  // 分批，每批500条
  for(let i=0;i<rows.length;i+=500){
    const batch=rows.slice(i,i+500).map(r=>userId?{...r,user_id:userId}:r)
    await writeWithColumnFallback(table,batch,async payload=>{
      const{error}=await supabase!.from(table).insert(payload)
      return{error}
    })
  }
}

// 更新单行
export async function updateRow(table:string,id:string,patch:any):Promise<void>{
  if(!supabase)return
  let payload=filterDropped(table,patch)
  for(let attempt=0;attempt<=MAX_COLUMN_RETRY;attempt++){
    if(Object.keys(payload).length===0){
      console.warn(`[云同步] 表 ${table} 的更新字段全部被云端结构拒绝，已跳过本次更新（id=${id}）。请尽快执行 supabase_schema.sql。`)
      return
    }
    const{error}=await supabase.from(table).update(payload).eq('id',id)
    if(!error)return
    const column=isMissingColumnError(error)?extractMissingColumn(error):null
    if(!column||!hasOwn(payload,column)){
      console.error(`update ${table} error:`,error)
      return
    }
    markDropped(table,column)
    payload=filterDropped(table,patch)
  }
  console.error(`update ${table} error: 连续 ${MAX_COLUMN_RETRY} 次因云端缺少字段被拒绝，已跳过本次更新`)
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