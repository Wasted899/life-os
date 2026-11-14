import {describe,it,expect} from 'vitest'
import {buildQuadrantColumns,buildSections,buildTimeline,filterTodos,sortTodos,timeOfValue} from './useTodosViewData'
import type {Category,Todo,TodoList} from '../../../core/types'

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

const lists = [
  {id:'inbox',name:'收集箱',color:'#2563eb',icon:'📥'},
  {id:'l2',name:'工作',color:'#111111',icon:'📁'},
] as unknown as TodoList[]

const categories = [
  {id:'c1',name:'学习',color:'#3b82f6'},
  {id:'c2',name:'生活',color:'#22c55e'},
] as unknown as Category[]

describe('filterTodos', () => {
  const todos = [
    todo({id:'a',due_date:'2026-11-14'}),
    todo({id:'b',due_date:'2026-11-15'}),
    todo({id:'c'}),
  ]

  it('保留当日任务与无日期任务', () => {
    expect(filterTodos(todos,'2026-11-14','all').map(item => item.id)).toEqual(['a','c'])
  })

  it('按清单筛选', () => {
    const data = [todo({id:'a',list_id:'inbox'}),todo({id:'b',list_id:'l2'})]
    expect(filterTodos(data,'2026-11-14','l2').map(item => item.id)).toEqual(['b'])
  })
})

describe('sortTodos', () => {
  it('置顶 → 未完成 → 时间升序（无时间排后）→ 原顺序', () => {
    const sorted = sortTodos([
      todo({id:'done',completed:true}),
      todo({id:'late',due_time:'18:00'}),
      todo({id:'early',due_time:'09:00'}),
      todo({id:'pin',pinned:true,due_time:'20:00'}),
      todo({id:'noTime'}),
      todo({id:'early2',due_time:'09:00'}),
    ])
    expect(sorted.map(item => item.id)).toEqual(['pin','early','early2','late','noTime','done'])
  })

  it('已完成项即使置顶也不排到未完成之前', () => {
    const sorted = sortTodos([todo({id:'a'}),todo({id:'donePin',completed:true,pinned:true})])
    expect(sorted.map(item => item.id)).toEqual(['a','donePin'])
  })
})

describe('buildSections', () => {
  it('status：固定输出未完成/已完成两组，key 带维度前缀', () => {
    const sections = buildSections([todo({id:'a'}),todo({id:'b',completed:true})],'status',lists,categories)
    expect(sections.map(section => [section.key,section.count])).toEqual([['status:undone',1],['status:done',1]])
  })

  it('list：只输出非空清单，孤儿清单单独成组', () => {
    const sections = buildSections([
      todo({id:'a',list_id:'inbox'}),
      todo({id:'b',list_id:'l2'}),
      todo({id:'c',list_id:'deleted'}),
    ],'list',lists,categories)
    expect(sections.map(section => [section.key,section.count,!!section.orphan])).toEqual([
      ['list:inbox',1,false],
      ['list:l2',1,false],
      ['list:__orphan_list__',1,true],
    ])
  })

  it('category：分类 → 未分类 → 孤儿分类，key 不冲突', () => {
    const sections = buildSections([
      todo({id:'a',category_id:'c1'}),
      todo({id:'b',category_id:''}),
      todo({id:'c',category_id:'deleted'}),
    ],'category',lists,categories)
    expect(sections.map(section => [section.key,section.count])).toEqual([
      ['category:c1',1],
      ['category:__uncategorized__',1],
      ['category:__orphan_category__',1],
    ])
  })

  it('none：单组全部', () => {
    const sections = buildSections([todo({id:'a'}),todo({id:'b'})],'none',lists,categories)
    expect(sections).toHaveLength(1)
    expect(sections[0].key).toBe('none:all')
    expect(sections[0].count).toBe(2)
  })
})

describe('buildQuadrantColumns', () => {
  it('固定输出 q1–q4 四列，空列保留且列内保持原顺序', () => {
    const columns = buildQuadrantColumns([
      todo({id:'a',quadrant:'q1'}),
      todo({id:'b',quadrant:'q1'}),
      todo({id:'c',quadrant:'q4'}),
    ])
    expect(columns.map(column => column.id)).toEqual(['q1','q2','q3','q4'])
    expect(columns[0].items.map(item => item.id)).toEqual(['a','b'])
    expect(columns[1].items).toEqual([])
    expect(columns[3].items.map(item => item.id)).toEqual(['c'])
  })
})

describe('buildTimeline', () => {
  it('无具体时间的任务不进时间线', () => {
    const items = [todo({id:'timed',due_time:'09:00'}),todo({id:'plain'})]
    expect(buildTimeline(items).map(item => item.id)).toEqual(['timed'])
  })

  it('start/due_time/end 任意有值即入线，按时间升序（start 优先）', () => {
    const items = [
      todo({id:'late',due_time:'18:00'}),
      todo({id:'startOnly',start:'2026-11-14T08:30:00'}),
      todo({id:'endOnly',end:'2026-11-14T21:00:00'}),
      todo({id:'early',due_time:'9:00'}),
      todo({id:'same',due_time:'09:00'}),
    ]
    expect(buildTimeline(items).map(item => item.id)).toEqual(['startOnly','early','same','late','endOnly'])
  })

  it('timeOfValue 兼容 HH:mm 与 ISO 字符串', () => {
    expect(timeOfValue('9:05')).toBe('09:05')
    expect(timeOfValue('2026-11-14T14:30:00')).toBe('14:30')
    expect(timeOfValue('')).toBe('')
  })
})
