import {describe,it,expect} from 'vitest'
import {decideCloudAction,hasMeaningfulCloudRows,buildCloudSignature,countMeaningful} from './cloudSync'
import type {CloudDecisionInput} from './cloudSync'
import {sanitizeAll} from '../lib/sanitize'
import type {DomainData} from './types'

/** 云端只剩默认种子：lists=inbox、categories=c1..c5、financeCategories=fc1..fc6+fi1..fi4 */
const SEED_CLOUD = {
  lists: [{id: 'inbox', name: '收集箱'}],
  categories: ['c1', 'c2', 'c3', 'c4', 'c5'].map(id => ({id, name: id})),
  financeCategories: ['fc1', 'fc2', 'fc3', 'fc4', 'fc5', 'fc6', 'fi1', 'fi2', 'fi3', 'fi4'].map(id => ({
    id,
    name: id,
  })),
}

/** 本地只剩默认种子 = 空 */
const localEmpty = (): DomainData =>
  sanitizeAll({lists: [{id: 'inbox'}], categories: ['c1', 'c2', 'c3', 'c4', 'c5'].map(id => ({id}))}) as DomainData

/** 本地有 1 条有效待办 */
const localWithTodo = (): DomainData =>
  sanitizeAll({todos: [{id: 'local-1', title: '本机任务'}]}) as DomainData

const makeInput = (overrides: Partial<CloudDecisionInput> = {}): CloudDecisionInput => ({
  ok: true,
  failed: [],
  cloud: {},
  local: localEmpty(),
  meta: null,
  userId: 'user-1',
  ...overrides,
})

describe('decideCloudAction', () => {
  it('场景1a：请求报错/断网 → error，且不产生任何状态更新（不进入"云端为空"分支）', () => {
    const decision = decideCloudAction(
      makeInput({
        ok: false,
        failed: ['todos', 'goals'],
        cloud: {},
        local: localWithTodo(),
      })
    )

    expect(decision.kind).toBe('error')
    if (decision.kind !== 'error') return
    expect(decision.failed).toEqual(['todos', 'goals'])
    expect(decision.message).toBe('云端读取失败，已保留本机数据')
    expect(decision.counts.todos).toBe(1)
    // 错误分支不得携带任何可写入本地的数据
    expect('data' in decision).toBe(false)
    expect('merge' in decision).toBe(false)
  })

  it('场景1b：读取失败时即使本地为空也保持 error（不会被当成"云端为空"静默通过）', () => {
    const decision = decideCloudAction(makeInput({ok: false, failed: ['todos'], local: localEmpty()}))
    expect(decision.kind).toBe('error')
  })

  it('场景2a：云端为空、本地有数据 → offer-upload', () => {
    const decision = decideCloudAction(makeInput({cloud: {}, local: localWithTodo()}))

    expect(decision.kind).toBe('offer-upload')
    if (decision.kind !== 'offer-upload') return
    expect(decision.counts.todos).toBe(1)
    expect(decision.counts.lists).toBe(0)
    expect(decision.counts.categories).toBe(0)
  })

  it('场景2b：云端只有种子数据（inbox/c1..c5/fc*/fi*）也算空 → offer-upload', () => {
    const decision = decideCloudAction(makeInput({cloud: SEED_CLOUD, local: localWithTodo()}))
    expect(decision.kind).toBe('offer-upload')
  })

  it('场景2c：云端为空且本地也只剩种子 → idle（不打扰用户）', () => {
    expect(decideCloudAction(makeInput({cloud: SEED_CLOUD, local: localEmpty()})).kind).toBe('idle')
  })

  it('场景3：云端有数据、本地为空 → pull(empty-local)，返回可写的完整 13 域数据', () => {
    const cloud = {
      todos: [{id: 'cloud-1', title: '云端任务', completed: false}],
      categories: [{id: 'c1'}, {id: 'c9', name: '自定义分类', color: '#000'}],
    }
    const decision = decideCloudAction(makeInput({cloud, local: localEmpty()}))

    expect(decision.kind).toBe('pull')
    if (decision.kind !== 'pull') return
    expect(decision.source).toBe('empty-local')
    expect(decision.signature).toBe(buildCloudSignature(cloud))
    expect(decision.data.todos.map(t => t.id)).toEqual(['cloud-1'])
    expect(decision.data.todos[0].title).toBe('云端任务')
    // 云端 categories 非空时以云端为准（含自定义分类）
    expect(decision.data.categories.map(c => c.id)).toContain('c9')
    // 云端未提供的域由 sanitize 补默认种子，保证 13 域齐全
    expect(decision.data.lists.map(l => l.id)).toEqual(['inbox'])
    expect(decision.counts.todos).toBe(0)
  })

  it('场景4：两边都有数据 → conflict，并给出合并预览', () => {
    const cloud = {todos: [{id: 'cloud-1', title: '云端任务'}]}
    const decision = decideCloudAction(
      makeInput({cloud, local: localWithTodo(), meta: null})
    )

    expect(decision.kind).toBe('conflict')
    if (decision.kind !== 'conflict') return
    expect(decision.merge).toEqual({added: 1, updated: 0, keptLocalOnly: 1, cloudTotal: 1})
    expect(decision.signature).toBe(buildCloudSignature(cloud))
    expect(decision.counts.todos).toBe(1)
  })

  it('边界：两边 id 完全一致 → 静默 pull(identical-ids)，以云端内容为准且保留本地独有域', () => {
    const local = sanitizeAll({
      todos: [{id: 'same', title: '本地标题'}],
      lists: [{id: 'inbox'}, {id: 'mine', name: '我的清单'}],
    }) as DomainData
    const cloud = {todos: [{id: 'same', title: '云端标题'}]}

    const decision = decideCloudAction(makeInput({cloud, local}))
    expect(decision.kind).toBe('pull')
    if (decision.kind !== 'pull') return
    expect(decision.source).toBe('identical-ids')
    expect(decision.data.todos[0].title).toBe('云端标题')
    // 云端没有 lists 时，本地自定义清单必须保留（防止被裸 payload 冲掉）
    expect(decision.data.lists.map(l => l.id)).toContain('mine')
  })

  it('边界：同一份云端签名已处理过 → idle，不重复弹窗', () => {
    const cloud = {todos: [{id: 'cloud-1', title: '云端任务'}]}
    const decision = decideCloudAction(
      makeInput({
        cloud,
        local: localWithTodo(),
        meta: {userId: 'user-1', cloudSignature: buildCloudSignature(cloud)},
      })
    )
    expect(decision.kind).toBe('idle')
  })

  it('边界：签名属于其他用户 → 仍然进入 conflict', () => {
    const cloud = {todos: [{id: 'cloud-1', title: '云端任务'}]}
    const decision = decideCloudAction(
      makeInput({
        cloud,
        local: localWithTodo(),
        meta: {userId: 'other-user', cloudSignature: buildCloudSignature(cloud)},
      })
    )
    expect(decision.kind).toBe('conflict')
  })
})

describe('种子判空辅助函数', () => {
  it('countMeaningful 排除种子 id', () => {
    expect(countMeaningful('lists', [{id: 'inbox'}])).toBe(0)
    expect(countMeaningful('lists', [{id: 'inbox'}, {id: 'mine'}])).toBe(1)
    expect(countMeaningful('todos', [{id: 't1'}])).toBe(1)
  })

  it('hasMeaningfulCloudRows 只认非种子行', () => {
    expect(hasMeaningfulCloudRows({})).toBe(false)
    expect(hasMeaningfulCloudRows(SEED_CLOUD)).toBe(false)
    expect(hasMeaningfulCloudRows({...SEED_CLOUD, todos: [{id: 'c1'}]})).toBe(true)
  })
})
