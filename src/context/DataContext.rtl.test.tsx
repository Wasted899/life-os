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
const {buildHabitTodoPlan}=await import('../features/habits/habitSchedule')
const dayjs=(await import('dayjs')).default

type Ctx=ReturnType<typeof useData>

/** 探针：把最新的 context 暴露给用例（不参与任何真实渲染逻辑） */
let ctx:Ctx
/** DataProvider 的渲染次数（用于观测是否出现死循环） */
let renderCount=0
function Probe(){
  ctx=useData()
  renderCount+=1
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

describe('DataContext 习惯排期（M1-13）',()=>{
  it('频率变更只重算一次，不产生重复待办，保留已完成',async()=>{
    render(tree())
    act(()=>{ctx.addHabit({title:'阅读',frequency:'daily',check_dates:[]} as any)})
    const habitId=ctx.habits[0].id
    const today=dayjs().format('YYYY-MM-DD')

    const expectedDaily=buildHabitTodoPlan(ctx.habits,today,6).length
    await waitFor(()=>expect(ctx.todos.filter(t=>t.habit_id===habitId)).toHaveLength(expectedDaily))

    // 观测写入次数：p_todos 的 persist effect 依赖 [todos]，一次 commit 最多写一次
    const setItemSpy=vi.spyOn(Storage.prototype,'setItem')
    const todoWrites=()=>setItemSpy.mock.calls.filter(([key])=>key==='planner:p_todos').length

    // 完成一条，用于验证重算时不会被删
    const first=ctx.todos.find(t=>t.habit_id===habitId)!
    act(()=>ctx.updateTodo(first.id,{completed:true}))

    // 打卡：只改 check_dates，不改变待办 id 集合
    const idsBefore=ctx.todos.filter(t=>t.habit_id===habitId).map(t=>t.id).sort()
    renderCount=0
    setItemSpy.mockClear()
    act(()=>ctx.updateHabit(habitId,{check_dates:[today]}))
    await act(async()=>{})
    expect(ctx.todos.filter(t=>t.habit_id===habitId).map(t=>t.id).sort()).toEqual(idsBefore)
    const checkRenders=renderCount
    const checkWrites=todoWrites()

    // 频率改为工作日：旧未完成作废，已完成保留，key 无重复
    renderCount=0
    setItemSpy.mockClear()
    act(()=>ctx.updateHabit(habitId,{frequency:'weekdays'}))
    await act(async()=>{})
    const after=ctx.todos.filter(t=>t.habit_id===habitId)
    const expectedWeekday=buildHabitTodoPlan(ctx.habits,today,6)
    const weekdayKeys=new Set(expectedWeekday.map(item=>item.dueDate))

    expect(after.some(todo=>todo.id===first.id&&todo.completed)).toBe(true)
    expect(new Set(after.map(todo=>`${todo.habit_id}|${todo.due_date}`)).size).toBe(after.length)
    expect(after.length).toBeGreaterThanOrEqual(expectedWeekday.length)
    expect(after.length).toBeLessThanOrEqual(expectedWeekday.length+1)
    after.filter(todo=>!todo.completed).forEach(todo=>{
      expect(weekdayKeys.has(todo.due_date||'')).toBe(true)
    })
    const frequencyRenders=renderCount
    const frequencyWrites=todoWrites()
    setItemSpy.mockRestore()

    // 打卡：业务 setState 与"今日待办完成"批处理为 1 次渲染；排期 effect 不触发
    expect({checkRenders,checkWrites}).toEqual({checkRenders:1,checkWrites:1})
    // 频率变更：1 次 setHabits + 1 次排期 setTodos；p_todos 只落盘 1 次
    // 若出现死循环，这两个值会持续增长而不是停在 2 / 1
    expect({frequencyRenders,frequencyWrites}).toEqual({frequencyRenders:2,frequencyWrites:1})
  })

  it('删除习惯：清理未完成待办、解绑已完成待办与习惯时间块，不误删其它时间块',async()=>{
    h.auth.user={id:'user-A',email:'a@test.local'}
    render(tree())
    act(()=>{ctx.addHabit({title:'跑步',frequency:'daily',check_dates:[]} as any)})
    const habitId=ctx.habits[0].id
    await waitFor(()=>expect(ctx.todos.filter(t=>t.habit_id===habitId).length).toBeGreaterThan(1))

    const today=dayjs().format('YYYY-MM-DD')
    act(()=>{
      ctx.addTimeBlock({date:today,start:9,end:10,title:'习惯时间',category:'学习',source:'habit',ref_type:'habit',ref_id:habitId})
      ctx.addTimeBlock({date:today,start:10,end:11,title:'手动时间',category:'学习',source:'manual'})
      ctx.addTimeBlock({date:today,start:11,end:12,title:'任务时间',category:'学习',source:'todo',ref_type:'todo',ref_id:'todo-x'})
    })
    const habitBlock=ctx.timeBlocks.find(tb=>tb.ref_id===habitId)!
    const manualBlock=ctx.timeBlocks.find(tb=>tb.title==='手动时间')!
    const todoBlock=ctx.timeBlocks.find(tb=>tb.ref_id==='todo-x')!
    expect(habitBlock).toBeTruthy()

    // 完成一条，验证历史记录不会被删除
    const linked=ctx.todos.filter(t=>t.habit_id===habitId)
    const done=linked[0]
    const unfinished=linked.slice(1)
    act(()=>ctx.updateTodo(done.id,{completed:true}))

    act(()=>ctx.deleteHabit(habitId))

    expect(ctx.habits).toHaveLength(0)
    // 不存在指向已删习惯的孤儿待办
    expect(ctx.todos.every(t=>t.habit_id!==habitId)).toBe(true)
    // 未完成待办被删除，已完成待办保留但解绑
    const doneAfter=ctx.todos.find(t=>t.id===done.id)!
    expect(doneAfter).toBeTruthy()
    expect(doneAfter.completed).toBe(true)
    expect(doneAfter.habit_id).toBeUndefined()
    unfinished.forEach(todo=>expect(ctx.todos.some(t=>t.id===todo.id)).toBe(false))

    // 时间块全部保留：习惯块只解绑，其它来源原样不动
    expect(ctx.timeBlocks).toHaveLength(3)
    expect(ctx.timeBlocks.find(tb=>tb.id===habitBlock.id)).toMatchObject({title:'习惯时间',ref_type:undefined,ref_id:undefined})
    expect(ctx.timeBlocks.find(tb=>tb.id===manualBlock.id)).toBe(manualBlock)
    expect(ctx.timeBlocks.find(tb=>tb.id===todoBlock.id)).toBe(todoBlock)

    // 云端：未完成待办删除；已完成待办与习惯时间块只解绑
    unfinished.forEach(todo=>expect(h.deleteRow).toHaveBeenCalledWith('todos',todo.id))
    expect(h.updateRow).toHaveBeenCalledWith('todos',done.id,{habit_id:null})
    expect(h.updateRow).toHaveBeenCalledWith('time_blocks',habitBlock.id,{ref_type:null,ref_id:null})
    expect(h.deleteRow).not.toHaveBeenCalledWith('time_blocks',habitBlock.id)
  })
})
