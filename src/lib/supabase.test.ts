import {describe,it,expect,vi,beforeEach,afterAll} from 'vitest'

/**
 * 网络层单测：mock @supabase/supabase-js，绝不发真实请求。
 * 模块在加载时读取 import.meta.env，所以必须先 stubEnv 再动态 import。
 */
const {mockFrom} = vi.hoisted(() => ({mockFrom: vi.fn()}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: {getUser: async () => ({data: {user: {id: 'user-1'}}})},
  }),
}))

/** 每张表的 select 返回：{data,error} */
let responses: Record<string, {data: any; error: any}> = {}

vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

const supabaseModule = await import('./supabase')
const {fetchTableStrict, fetchAllTablesStrict, CloudReadError, isCloudMode} = supabaseModule

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  responses = {}
  mockFrom.mockReset()
  mockFrom.mockImplementation((table: string) => ({
    select: () => Promise.resolve(responses[table] ?? {data: [], error: null}),
  }))
})

afterAll(() => {
  consoleError.mockRestore()
  vi.unstubAllEnvs()
})

describe('fetchTableStrict', () => {
  it('读取成功：原样返回行数据', async () => {
    responses.todos = {data: [{id: 't1'}, {id: 't2'}], error: null}
    await expect(fetchTableStrict('todos')).resolves.toEqual([{id: 't1'}, {id: 't2'}])
    expect(mockFrom).toHaveBeenCalledWith('todos')
  })

  it('云端为空：返回空数组且不抛错（与读取失败严格区分）', async () => {
    responses.todos = {data: [], error: null}
    await expect(fetchTableStrict('todos')).resolves.toEqual([])
  })

  it('请求报错/断网：抛 CloudReadError，绝不静默返回空数组', async () => {
    responses.todos = {data: null, error: {message: 'Failed to fetch', code: 'NETWORK'}}
    await expect(fetchTableStrict('todos')).rejects.toBeInstanceOf(CloudReadError)

    responses.todos = {data: null, error: {message: 'Failed to fetch', code: 'NETWORK'}}
    const error = await fetchTableStrict('todos').catch(e => e)
    expect(error.table).toBe('todos')
    expect(error.code).toBe('NETWORK')
    expect(error.message).toBe('Failed to fetch')
  })

  it('返回非数组（结构异常）也视为读取失败', async () => {
    responses.todos = {data: {unexpected: true}, error: null}
    await expect(fetchTableStrict('todos')).rejects.toBeInstanceOf(CloudReadError)
  })

  it('isCloudMode 由 stub 的环境变量决定（未使用真实凭据）', () => {
    expect(isCloudMode).toBe(true)
  })
})

describe('fetchAllTablesStrict', () => {
  it('全部成功：ok=true，data 覆盖所有表', async () => {
    responses.todos = {data: [{id: 't1'}], error: null}
    responses.goals = {data: [{id: 'g1'}], error: null}

    const result = await fetchAllTablesStrict(['todos', 'goals'])
    expect(result.ok).toBe(true)
    expect(result.failed).toEqual([])
    expect(result.data.todos).toEqual([{id: 't1'}])
    expect(result.data.goals).toEqual([{id: 'g1'}])
  })

  it('部分失败：ok=false，failed 列出失败表，成功表数据保留供排查', async () => {
    responses.todos = {data: [{id: 't1'}], error: null}
    responses.goals = {data: null, error: {message: 'Failed to fetch', code: 'NETWORK'}}

    const result = await fetchAllTablesStrict(['todos', 'goals'])
    expect(result.ok).toBe(false)
    expect(result.failed).toEqual(['goals'])
    expect(result.data.todos).toEqual([{id: 't1'}])
    expect(result.data.goals).toBeUndefined()
  })

  it('全部为空表：ok=true 且各表为空数组（不会被当成失败）', async () => {
    const result = await fetchAllTablesStrict(['todos', 'goals'])
    expect(result.ok).toBe(true)
    expect(result.failed).toEqual([])
    expect(result.data.todos).toEqual([])
  })
})
