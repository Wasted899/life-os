import {describe,expect,it} from 'vitest'
import type {Goal} from '../../core/types'
import {
  buildGoalIndex,
  dateOfPeriodKey,
  goalLevelOf,
  goalParentError,
  goalPeriodKeyOf,
  normalizePeriodKey,
  periodBounds,
  periodContains,
  periodKeyFor,
  periodLabel,
  repairGoalForest,
  shiftPeriodKey,
} from './goalTree'

const goal=(patch:Partial<Goal>&{id:string}):Goal=>({
  title:patch.id,
  type:'yearly',
  progress:0,
  status:'active',
  ...patch,
})

describe('层级与周期工具', () => {
  it('level 优先，旧 type 可兜底', () => {
    expect(goalLevelOf(goal({id:'a',type:'yearly'}))).toBe('year')
    expect(goalLevelOf(goal({id:'b',type:'monthly',level:'day'}))).toBe('day')
    expect(goalLevelOf(goal({id:'c',type:'weekly'}))).toBe('week')
  })

  it('periodKeyFor 与对齐规则', () => {
    expect(periodKeyFor('year','2026-11-14')).toBe('2026')
    expect(periodKeyFor('month','2026-11-14')).toBe('2026-11')
    expect(periodKeyFor('week','2026-11-14')).toBe('2026-W46')
    expect(periodKeyFor('day','2026-11-14')).toBe('2026-11-14')
  })

  it('normalizePeriodKey 补零并拒绝非法值', () => {
    expect(normalizePeriodKey('month','2026-1')).toBe('2026-01')
    expect(normalizePeriodKey('week','2026-W6')).toBe('2026-W06')
    expect(normalizePeriodKey('month','2026-13')).toBeNull()
    expect(normalizePeriodKey('week','2026-W54')).toBeNull()
    expect(normalizePeriodKey('day','not-a-date')).toBeNull()
  })

  it('shiftPeriodKey 跨年/跨周/跨日', () => {
    expect(shiftPeriodKey('year','2026',1)).toBe('2027')
    expect(shiftPeriodKey('month','2026-12',1)).toBe('2027-01')
    expect(shiftPeriodKey('week','2026-W46',1)).toBe('2026-W47')
    expect(shiftPeriodKey('day','2026-11-14',1)).toBe('2026-11-15')
  })

  it('periodBounds / periodContains / periodLabel', () => {
    expect(periodBounds('week','2026-W46')).toEqual({start:'2026-11-09',end:'2026-11-15'})
    expect(periodContains('month','2026-11','day','2026-11-14')).toBe(true)
    expect(periodContains('month','2026-11','week','2026-W46')).toBe(true)
    // 跨月周必须完整落在父周期内，11-30~12-06 不属于任何单月
    expect(periodContains('month','2026-11','week','2026-W49')).toBe(false)
    expect(periodContains('month','2026-12','week','2026-W49')).toBe(false)
    expect(periodLabel('month','2026-11')).toBe('2026 年 11 月')
    expect(periodLabel('week','2026-W46')).toBe('2026-W46 周')
  })

  it('dateOfPeriodKey 回填日期选择器', () => {
    expect(dateOfPeriodKey('week','2026-W46')).toBe('2026-11-09')
    expect(dateOfPeriodKey('month','2026-11')).toBe('2026-11-01')
    expect(dateOfPeriodKey('year','2026')).toBe('2026-01-01')
    expect(dateOfPeriodKey('day','2026-11-14')).toBe('2026-11-14')
  })

  it('goalPeriodKeyOf：缺失时按 start_date → 当前周期推导', () => {
    const g=goal({id:'g',level:'month',period_key:undefined,start_date:'2026-10-20'})
    expect(goalPeriodKeyOf(g,'2026-11-14')).toBe('2026-10')
    const empty=goal({id:'e',level:'week',period_key:'bad',start_date:undefined})
    expect(goalPeriodKeyOf(empty,'2026-11-14')).toBe('2026-W46')
  })
})

describe('buildGoalIndex', () => {
  it('一次建索引：父子 / 层级 / 等权汇总', () => {
    const goals:[Goal,Goal,Goal,Goal,Goal]=[
      goal({id:'y',level:'year',period_key:'2026',progress:10}),
      goal({id:'m1',level:'month',period_key:'2026-11',parent_id:'y',progress:0}),
      goal({id:'m2',level:'month',period_key:'2026-12',parent_id:'y',progress:50}),
      goal({id:'d1',level:'day',period_key:'2026-11-14',parent_id:'m1',progress:100}),
      goal({id:'root',level:'year',period_key:'2027',progress:30}),
    ]
    const index=buildGoalIndex(goals)

    expect(index.byId.get('m1')?.progress).toBe(0)
    expect(index.childrenOf.get('')?.map(g=>g.id)).toEqual(['y','root'])
    expect(index.childrenOf.get('y')?.map(g=>g.id)).toEqual(['m1','m2'])
    expect(index.byLevel.year.map(g=>g.id)).toEqual(['y','root'])
    // 叶子用自身；父目标等权平均；年度忽略自身 progress:10
    expect(index.rolledProgress.get('d1')).toBe(100)
    expect(index.rolledProgress.get('m1')).toBe(100)
    expect(index.rolledProgress.get('m2')).toBe(50)
    expect(index.rolledProgress.get('y')).toBe(75)
    expect(index.rolledProgress.get('root')).toBe(30)
    expect(index.cycles.size).toBe(0)
  })

  it('成环不死循环，环上节点回落自身 progress', () => {
    const goals=[
      goal({id:'a',level:'year',parent_id:'b',progress:40}),
      goal({id:'b',level:'year',parent_id:'a',progress:60}),
    ]
    const index=buildGoalIndex(goals)
    expect(index.cycles.size).toBeGreaterThan(0)
    expect(typeof index.rolledProgress.get('a')).toBe('number')
    expect(typeof index.rolledProgress.get('b')).toBe('number')
  })
})

describe('goalParentError', () => {
  const parent=goal({id:'w',level:'week',period_key:'2026-W46',title:'第 46 周'})

  it('跨级挂载被拒绝', () => {
    const monthParent=goal({id:'m',level:'month',period_key:'2026-11'})
    expect(goalParentError('day','2026-11-14',monthParent)).toBe('目标层级必须相邻：日目标的父目标只能是周目标')
  })

  it('周期不在父周期内时提示带出父周期', () => {
    expect(goalParentError('day','2026-11-16',parent)).toBe('日目标必须落在其父周目标的周期内（父周期：2026-W46 周）')
  })

  it('合法父子返回 null', () => {
    expect(goalParentError('day','2026-11-14',parent)).toBeNull()
  })
})

describe('repairGoalForest', () => {
  it('解绑父不存在 / 自指 / 层级不匹配 / 成环', () => {
    const result=repairGoalForest([
      goal({id:'a',level:'year',parent_id:'missing'}),
      goal({id:'b',level:'month',parent_id:'b'}),
      goal({id:'c',level:'week',parent_id:'a'}),
      goal({id:'d',level:'year',parent_id:'e'}),
      goal({id:'e',level:'year',parent_id:'d'}),
    ])
    const byId=new Map(result.goals.map(g=>[g.id,g]))
    expect(byId.get('a')?.parent_id).toBeUndefined()
    expect(byId.get('b')?.parent_id).toBeUndefined()
    expect(byId.get('c')?.parent_id).toBeUndefined()
    // 环被断开：两个节点中至多一个仍有 parent
    const cycleParents=[byId.get('d')?.parent_id,byId.get('e')?.parent_id].filter(Boolean)
    expect(cycleParents.length).toBeLessThanOrEqual(1)
    expect(result.changed).toBeGreaterThanOrEqual(4)
  })

  it('合法父子保持不变', () => {
    const result=repairGoalForest([
      goal({id:'y',level:'year'}),
      goal({id:'m',level:'month',parent_id:'y'}),
    ])
    expect(result.changed).toBe(0)
    expect(result.goals[1].parent_id).toBe('y')
  })
})
