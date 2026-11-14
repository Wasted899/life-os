import {describe,it,expect} from 'vitest'
import {migrate,normalizeLocalData,repairTodoRefs} from './migrate'
import {sanitizeTodos} from '../lib/sanitize'
import type {Category,Todo,TodoList} from './types'

const lists = [
  {id:'inbox',name:'收集箱',color:'#2563eb',icon:'📥'},
  {id:'l2',name:'工作',color:'#111111',icon:'📁'},
] as unknown as TodoList[]

const categories = [{id:'c1',name:'学习',color:'#3b82f6'}] as unknown as Category[]

const todo = (patch: Record<string, unknown>): Todo => ({
  id:'t',
  title:'任务',
  quadrant:'q2',
  completed:false,
  list_id:'inbox',
  pinned:false,
  status:'todo',
  source:'todo',
  ...patch,
}) as unknown as Todo

describe('priority → quadrant 收口', () => {
  it('sanitizeTodos 把旧 priority 归一为 quadrant，且不再输出 priority', () => {
    const [result] = sanitizeTodos([{id:'t1',title:'旧数据',priority:'q1'}])
    expect(result.quadrant).toBe('q1')
    expect('priority' in result).toBe(false)
  })

  it('quadrant 优先于 priority，非法值回落 q2', () => {
    expect(sanitizeTodos([{id:'a',title:'a',quadrant:'q3',priority:'q1'}])[0].quadrant).toBe('q3')
    expect(sanitizeTodos([{id:'b',title:'b',priority:'legacy'}])[0].quadrant).toBe('q2')
  })

  it('migrate 输出不含 priority（冷启动 / 导入链路）', () => {
    const result = migrate({todos:[{id:'t1',title:'旧数据',priority:'q4'}],lists,categories})
    expect(result.data.todos[0].quadrant).toBe('q4')
    expect('priority' in result.data.todos[0]).toBe(false)
  })
})

describe('repairTodoRefs', () => {
  it('缺失/孤儿清单归收集箱，孤儿分类与"清单当分类"清空', () => {
    const repaired = repairTodoRefs(
      [
        todo({id:'t1',list_id:''}),
        todo({id:'t2',list_id:'deleted-list'}),
        todo({id:'t3',list_id:'inbox',category_id:'deleted-cat'}),
        todo({id:'t4',list_id:'inbox',category_id:'l2'}),
        todo({id:'t5',list_id:'l2',category_id:'c1'}),
      ],
      lists,
      categories,
    )
    expect(repaired.missingList).toBe(1)
    expect(repaired.orphanList).toBe(1)
    expect(repaired.orphanCategory).toBe(1)
    expect(repaired.crossCategory).toBe(1)
    expect(repaired.todos.map(item => [item.id,item.list_id,item.category_id || ''])).toEqual([
      ['t1','inbox',''],
      ['t2','inbox',''],
      ['t3','inbox',''],
      ['t4','inbox',''],
      ['t5','l2','c1'],
    ])
  })

  it('幂等：repair(repair(x)) 与 repair(x) 完全一致且 changed=0', () => {
    const first = repairTodoRefs([todo({id:'t1',list_id:'deleted-list',category_id:'deleted-cat'})],lists,categories)
    const second = repairTodoRefs(first.todos,lists,categories)
    expect(second.changed).toBe(0)
    expect(second.todos).toEqual(first.todos)
  })

  it('无 inbox 时回落到第一个清单，不凭空造清单', () => {
    const onlyWork = [{id:'l9',name:'工作',color:'#111111',icon:'📁'}] as unknown as TodoList[]
    const repaired = repairTodoRefs([todo({list_id:'deleted-list'})],onlyWork,categories)
    expect(repaired.todos[0].list_id).toBe('l9')
  })

  it('源里没有 lists / categories 时跳过对应校验（局部导入保护）', () => {
    const repaired = repairTodoRefs([todo({id:'t1',list_id:'mine',category_id:'c1'})],lists,categories,{checkLists:false,checkCategories:false})
    expect(repaired.changed).toBe(0)
    expect(repaired.todos[0].list_id).toBe('mine')
    expect(repaired.todos[0].category_id).toBe('c1')
  })
})

describe('normalizeLocalData 端到端', () => {
  it('旧 priority + 孤儿引用在一次迁移中全部收口', () => {
    const result = normalizeLocalData({
      todos:[
        {id:'t1',title:'旧优先级',priority:'q1',list_id:'l2',category_id:'c1'},
        {id:'t2',title:'孤儿清单',list_id:'deleted-list'},
        {id:'t3',title:'清单当分类',list_id:'inbox',category_id:'l2'},
        {id:'t4',title:'孤儿分类',list_id:'inbox',category_id:'deleted-cat'},
      ],
      lists,
      categories,
    })
    const byId = new Map(result.data.todos.map(item => [item.id,item]))
    expect(byId.get('t1')!.quadrant).toBe('q1')
    expect(byId.get('t1')!.list_id).toBe('l2')
    expect(byId.get('t1')!.category_id).toBe('c1')
    expect(byId.get('t2')!.list_id).toBe('inbox')
    expect(byId.get('t3')!.category_id).toBe('')
    expect(byId.get('t4')!.category_id).toBe('')
    result.data.todos.forEach(item => expect('priority' in item).toBe(false))
  })

  it('重复执行迁移结果稳定（幂等）', () => {
    const raw = {todos:[{id:'t1',title:'a',priority:'q3',list_id:'deleted'}],lists,categories}
    const once = normalizeLocalData(raw).data
    const twice = normalizeLocalData(once).data
    expect(twice.todos).toEqual(once.todos)
    expect(twice.lists).toEqual(once.lists)
  })
})
