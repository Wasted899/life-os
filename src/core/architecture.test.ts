/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'

const files = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const IDENTIFIER = /\b(transactions|financeCategories|accounts|recurrings)\b/

/** 允许出现记账实体标识符的文件（新增使用者必须先评估是否越界） */
const ALLOWED_IDENTIFIER_FILES = new Set([
  '/src/core/types.ts',
  '/src/core/migrate.ts',
  '/src/core/cloudSync.ts',
  '/src/lib/sanitize.ts',
  '/src/lib/supabase.ts',
  '/src/context/DataContext.tsx',
  '/src/features/today/TodayPage.tsx',
  '/src/features/today/todayView.ts',
  // 测试与架构守卫自身
  '/src/core/cloudSync.test.ts',
  '/src/core/financeMigration.test.ts',
  '/src/context/DataContext.rtl.test.tsx',
  '/src/features/today/todayView.test.ts',
  '/src/core/architecture.test.ts',
])

const isAllowedIdentifierFile = (path: string): boolean =>
  path.startsWith('/src/features/finance/') || ALLOWED_IDENTIFIER_FILES.has(path)

const importsFinance = (source: string): boolean =>
  /['"][^'"]*(?:features\/)?finance\//.test(source)

type FileMap = Record<string, string>

/** 规则一：core 下任何文件 import 了 finance */
const scanCoreFinanceImports = (map: FileMap): string[] =>
  Object.entries(map)
    .filter(([path]) => path.startsWith('/src/core/'))
    .filter(([, source]) => importsFinance(source))
    .map(([path]) => path)

/** 规则二：白名单之外出现记账实体标识符 */
const scanIdentifierLeaks = (map: FileMap): string[] =>
  Object.entries(map)
    .filter(([path]) => !isAllowedIdentifierFile(path))
    .filter(([, source]) => IDENTIFIER.test(source))
    .map(([path]) => path)

describe('记账模块架构隔离', () => {
  it('glob 实际读到了源文件（避免空集合导致假通过）', () => {
    expect(Object.keys(files).length).toBeGreaterThan(50)
    expect(files['/src/core/types.ts']).toBeTruthy()
    expect(files['/src/features/finance/model/selectors.ts']).toBeTruthy()
  })

  it('src/core/** 不得 import src/features/finance/**', () => {
    expect(scanCoreFinanceImports(files)).toEqual([])
  })

  it('四个记账标识符只允许出现在白名单文件', () => {
    expect(scanIdentifierLeaks(files)).toEqual([])
  })

  it('扫描函数对合成样本能真正报出违规（不是永远通过）', () => {
    const dirty: FileMap = {
      // core 反向依赖 finance
      '/src/core/bad.ts': "import { buildLedger } from '../features/finance/model/accounts'",
      // 白名单外直接读记账实体
      '/src/features/todos/TodosPage.tsx': 'const { accounts, transactions } = useData()',
      // 合规样本：借用 relative finance 路径但不在 core；白名单文件读实体
      '/src/features/today/todayView.ts': 'export const x = data.transactions',
      '/src/features/finance/model/accounts.ts': 'export const ok = 1',
    }
    expect(scanCoreFinanceImports(dirty)).toEqual(['/src/core/bad.ts'])
    // bad.ts 的 import 路径里也含 accounts，按标识符规则同样应被拦下
    expect(scanIdentifierLeaks(dirty)).toEqual(['/src/core/bad.ts','/src/features/todos/TodosPage.tsx'])
  })
})

/**
 * 模块开关是纯逻辑：core/modules.ts 只能依赖 core 内部，
 * 不得反向 import context/** 或 features/**，否则「关闭模块」会绑定到数据层。
 */
const IMPURE_MODULE_IMPORT = /['"][^'"]*(?:context|features)\//

const scanModuleSwitchesImpureImports = (map: FileMap): string[] =>
  Object.entries(map)
    .filter(([path]) => path === '/src/core/modules.ts')
    .filter(([, source]) => IMPURE_MODULE_IMPORT.test(source))
    .map(([path]) => path)

describe('模块开关纯逻辑隔离', () => {
  it('core/modules.ts 必须存在且被扫描到', () => {
    expect(files['/src/core/modules.ts']).toBeTruthy()
  })

  it('core/modules.ts 不得 import context/** 或 features/**', () => {
    expect(scanModuleSwitchesImpureImports(files)).toEqual([])
  })

  it('规则对合成样本能真正报出违规', () => {
    const dirty: FileMap = {
      '/src/core/modules.ts': "import { useData } from '../context/DataContext'",
    }
    expect(scanModuleSwitchesImpureImports(dirty)).toEqual(['/src/core/modules.ts'])
  })
})

/**
 * 余额只允许派生：UI 不得读 Account.balance，也不得把 balance 当作补丁写回。
 * opening_balance 是合法字段，正则里的 \b 保证不会误伤。
 * model/accounts.ts 是唯一允许读 balance 的兼容回落实现。
 */
const financeUiFiles = Object.entries(files)
  .filter(([path]) => path.startsWith('/src/features/finance/') && !path.endsWith('.test.ts'))
  .filter(([path]) => path !== '/src/features/finance/model/accounts.ts')

const scanBalanceReads = (map: FileMap): string[] =>
  Object.entries(map)
    .filter(([path]) => path.startsWith('/src/features/finance/') && !path.endsWith('.test.ts'))
    .filter(([path]) => path !== '/src/features/finance/model/accounts.ts')
    .filter(([, source]) => /\.balance\b/.test(source))
    .map(([path]) => path)

const scanBalancePatches = (map: FileMap): string[] =>
  Object.entries(map)
    .filter(([path]) => path.startsWith('/src/features/finance/') && !path.endsWith('.test.ts'))
    .filter(([, source]) => /updateAccount\s*\([^)]*\bbalance\s*:/.test(source))
    .map(([path]) => path)

describe('记账余额只能派生', () => {
  it('财务 UI 不读 Account.balance', () => {
    expect(financeUiFiles.length).toBeGreaterThan(0)
    expect(scanBalanceReads(files)).toEqual([])
  })

  it('财务 UI 不用 updateAccount 写 balance 增量', () => {
    expect(scanBalancePatches(files)).toEqual([])
  })

  it('规则对合成样本能真正报出违规', () => {
    const dirty: FileMap = {
      '/src/features/finance/bad.tsx': 'const text = account.balance.toFixed(2)',
      '/src/features/finance/alsoBad.tsx': 'updateAccount(id, { balance: account.balance - amount })',
      '/src/features/finance/good.tsx': 'updateAccount(id, { opening_balance: 100 })',
    }
    expect(scanBalanceReads(dirty)).toEqual(['/src/features/finance/bad.tsx','/src/features/finance/alsoBad.tsx'])
    expect(scanBalancePatches(dirty)).toEqual(['/src/features/finance/alsoBad.tsx'])
  })
})
