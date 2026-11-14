// @vitest-environment jsdom
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,act,cleanup,waitFor} from '@testing-library/react'
import type {ReactNode} from 'react'

/**
 * DataContext 的 React 层集成测试（RTL）。
 *
 * 原则：
 * 1. 渲染真实 DataProvider，只在边界处 mock：AuthContext（登录态）与 lib/supabase（网络层）。
 * 2. 不请求任何真实 Supabase：@supabase/supabase-js 从未被加载，DataContext 拿到的整套网络 API 都是假的。
 * 3. localStorage 用 jsdom 自带的，每个用例前清空。
 */
const h=vi.hoisted(()=>({
  auth:{user:null as {id:string;email?:string}|null,loading:false,recoveryMode:false},
  fetchAllTablesStrict:vi.fn(),
  insertRow:vi.fn(),
  updateRow:vi.fn(),
  deleteRow:vi.fn(),
  batchInsert:vi.fn(),
  clearTable:vi.fn(),
  getUser:vi.fn(),
}))

vi.mock('./AuthContext',()=>({useAuth:()=>h.auth}))

vi.mock('../lib/supabase',()=>({
  isCloudMode:true,
  supabase:{auth:{getUser:h.getUser},from:vi.fn()},
  fetchAllTablesStrict:h.fetchAllTablesStrict,
  insertRow:h.insertRow,
  updateRow:h.updateRow,
  deleteRow:h.deleteRow,
  batchInsert:h.batchInsert,
  clearTable:h.clearTable,
  getDroppedColumns:()=>({}),
  TABLE_MAP:{
    todos:'todos',lists:'todo_lists',categories:'categories',goals:'goals',habits:'habits',
    days:'important_days',timeBlocks:'time_blocks',pomodoros:'pomodoros',transactions:'transactions',
    memos:'memos',financeCategories:'finance_categories',accounts:'accounts',recurrings:'recurrings',
  },
}))

const {DataProvider,useData}=await import('./DataContext')

type Ctx=ReturnType<typeof useData>

/** 探针：把最新的 context 暴露给用例（不参与任何真实渲染逻辑） */
let ctx:Ctx
function Probe(){
  ctx=useData()
  return null
}
const tree=():ReactNode=> <DataProvider><Probe/></DataProvider>

/** 读 p_* 的实际落盘值（save() 写入 planner:<key> 信封） */
const readP=(key:string):any[]=>{
  const raw=localStorage.getItem(`planner:${key}`)
  if(!raw)return []
  const parsed=JSON.parse(raw)
  return parsed&&typeof parsed==='object'&&'data' in parsed?parsed.data:[]
}

const DOMAIN_FIELDS=['todos','lists','categories','goals','habits','days','timeBlocks','pomodoros','transactions','memos','financeCategories','accounts','recurrings'] as const

/** 13 域快照：用于断言"一个字段都没变" */
const snapshotDomains=()=>JSON.stringify(DOMAIN_FIELDS.map(key=>(ctx as any)[key]))

beforeEach(()=>{
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  h.auth.user=null
  h.auth.loading=false
  h.auth.recoveryMode=false
  h.fetchAllTablesStrict.mockResolvedValue({ok:true,data:{},failed:[]})
  h.getUser.mockResolvedValue({data:{user:{id:'user-A',email:'a@test.local'}}})
  window.alert=vi.fn()
})

afterEach(()=>{
  cleanup()
})

describe('DataContext React 层保护',()=>{
  it('场景1：登出后内存 state 与 localStorage 的 p_* 都恢复为登录前的快照',async()=>{
    const view=render(tree())

    // 登录前：本地模式下编辑，然后按流程在"登录前"打快照
    act(()=>{ctx.addTodo({title:'登录前任务'} as any)})
    act(()=>{ctx.snapshotLocalWorkspace()})
    // 快照里的 todos（id + title）：sanitize 恢复后会补齐默认字段，因此按 id/title 比对
    const beforeLogin=ctx.todos.map(t=>({id:t.id,title:t.title}))
    expect(beforeLogin.map(t=>t.title)).toEqual(['登录前任务'])

    // 登录 A
    h.auth.user={id:'user-A',email:'a@test.local'}
    view.rerender(tree())
    await waitFor(()=>expect(h.fetchAllTablesStrict).toHaveBeenCalled())
    expect(localStorage.getItem('planner:auth:owner')).toBe('user-A')

    // 登录态继续编辑，并确认已落盘
    act(()=>{ctx.addTodo({title:'账号A新增'} as any)})
    expect(readP('p_todos').map((t:any)=>t.title)).toContain('账号A新增')

    // 登出
    h.auth.user=null
    view.rerender(tree())

    // 内存恢复
    expect(ctx.todos.map(t=>({id:t.id,title:t.title}))).toEqual(beforeLogin)
    // localStorage 恢复（第 3 层直写）
    expect(readP('p_todos').map((t:any)=>t.title)).toEqual(['登录前任务'])
    // owner 与云端元数据复位
    expect(localStorage.getItem('planner:auth:owner')).toBe('local')
    expect(localStorage.getItem('planner:cloud:last-sync')).toBeNull()
  })

  it('场景2：A 上传中途切到 B，上传被中止且不写脏数据',async()=>{
    h.auth.user={id:'user-A',email:'a@test.local'}
    const view=render(tree())
    act(()=>{ctx.addTodo({title:'A的数据'} as any)})
    const localBefore=localStorage.getItem('planner:p_todos')
    // 上面的本地新增会走 insertRow（登录态 CRUD），先清掉计数，只观察上传链路
    h.insertRow.mockClear()

    // 让 getUser 挂起：模拟"上传已在途"
    let resolveGetUser:(value:any)=>void=()=>{}
    h.getUser.mockImplementation(()=>new Promise(resolve=>{resolveGetUser=resolve}))

    let uploadPromise!:Promise<void>
    let caught:any=null
    await act(async()=>{
      uploadPromise=ctx.uploadLocalToCloud().catch(e=>{caught=e})
    })

    // 切号到 B（此时在途请求对应的会话已经是 B）
    h.auth.user={id:'user-B',email:'b@test.local'}
    view.rerender(tree())
    expect(localStorage.getItem('planner:auth:owner')).toBe('user-B')

    await act(async()=>{
      resolveGetUser({data:{user:{id:'user-B',email:'b@test.local'}}})
      await uploadPromise
    })

    expect(caught).toBeInstanceOf(Error)
    expect(caught.message).toBe('登录账号已变化，已中止上传以保护数据')
    // 中止发生在清空/批量插入之前
    expect(h.clearTable).not.toHaveBeenCalled()
    expect(h.batchInsert).not.toHaveBeenCalled()
    expect(h.insertRow).not.toHaveBeenCalled()
    // 本地数据未被污染（登录 B 只改了 owner，p_todos 仍是 A 的缓存，未追加 B 内容）
    expect(localStorage.getItem('planner:p_todos')).toBe(localBefore)
  })

  it('场景3：recoveryMode 下不发起任何云端拉取，cloud 保持 idle',async()=>{
    h.auth.user={id:'user-A',email:'a@test.local'}
    h.auth.recoveryMode=true
    render(tree())
    await act(async()=>{})

    expect(h.fetchAllTablesStrict).not.toHaveBeenCalled()
    expect(ctx.cloud.phase).toBe('idle')
    expect(ctx.cloudLoading).toBe(false)
  })

  it('场景4a：云端读取返回 error（ok=false）→ phase=error，本地 13 域不变',async()=>{
    const consoleError=vi.spyOn(console,'error').mockImplementation(()=>{})
    h.auth.user={id:'user-A',email:'a@test.local'}
    h.fetchAllTablesStrict.mockResolvedValue({ok:false,data:{},failed:['todos','goals']})
    render(tree())
    act(()=>{ctx.addTodo({title:'本地数据'} as any)})
    const before=snapshotDomains()

    await waitFor(()=>expect(ctx.cloud.phase).toBe('error'))
    expect(ctx.cloud.failedTables).toEqual(['todos','goals'])
    expect(snapshotDomains()).toBe(before)
    consoleError.mockRestore()
  })

  it('场景4b：请求直接 reject（断网）→ phase=error，本地 13 域不变',async()=>{
    const consoleError=vi.spyOn(console,'error').mockImplementation(()=>{})
    h.auth.user={id:'user-A',email:'a@test.local'}
    h.fetchAllTablesStrict.mockRejectedValue(new Error('network down'))
    render(tree())
    act(()=>{ctx.addMemo({title:'断网前',content:'keep'} as any)})
    const before=snapshotDomains()

    await waitFor(()=>expect(ctx.cloud.phase).toBe('error'))
    expect(ctx.cloud.message).toBe('network down')
    expect(snapshotDomains()).toBe(before)
    consoleError.mockRestore()
  })
})
