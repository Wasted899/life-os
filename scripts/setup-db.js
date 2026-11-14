/**
 * 数据库初始化脚本（M1-6）
 *
 * 用法：
 *   1. 在项目根目录的 .env.local 里添加一行：
 *        DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
 *   2. npm run db:setup
 *
 * 行为：
 *   - 只从 .env.local 读取 DATABASE_URL，不硬编码、不打印连接串或密码
 *   - 先跑 time_blocks 的引用唯一性预检，有重复直接退出（不执行任何 DDL）
 *   - 通过后读取 supabase_schema.sql，在一个事务里执行（BEGIN … COMMIT）
 *   - 任意一步出错 → ROLLBACK，并以非零码退出
 *
 * 注意：脚本不会创建或修改 .env.local；缺少 DATABASE_URL 时只提示并退出。
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const {Client} = pg
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = path.join(ROOT, '.env.local')
const SCHEMA_PATH = path.join(ROOT, 'supabase_schema.sql')

const log = (message) => console.log(`[db:setup] ${message}`)
const fail = (message) => {
  console.error(`[db:setup] ✗ ${message}`)
  process.exitCode = 1
}

/** 预检：time_blocks 的 (user_id, ref_type, ref_id) 是否重复 */
async function runPreflight(client) {
  const table = await client.query("select to_regclass('public.time_blocks') as regclass")
  if (!table.rows[0].regclass) {
    log('预检：time_blocks 尚不存在，跳过（首次建库属正常情况）')
    return
  }

  const column = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'time_blocks' and column_name = 'ref_type'`,
  )
  if (column.rowCount === 0) {
    log('预检：time_blocks 尚无 ref_type 列，跳过（本轮会补上该列）')
    return
  }

  const duplicates = await client.query(
    `select user_id, ref_type, ref_id, count(*)::int as duplicate_count
     from time_blocks
     where ref_type is not null and ref_id is not null
     group by user_id, ref_type, ref_id
     having count(*) > 1
     order by duplicate_count desc`,
  )

  if (duplicates.rowCount > 0) {
    console.error('\n[db:setup] ✗ 预检未通过：time_blocks 存在重复的 (user_id, ref_type, ref_id)')
    console.table(duplicates.rows)
    console.error('[db:setup] 请先清理上述重复数据（脚本不会自动删除任何业务数据），再重新执行。')
    throw new Error('time_blocks 引用唯一性预检未通过')
  }

  log('预检通过：time_blocks 无重复引用')
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    fail('未找到 .env.local。请先在项目根目录创建该文件，并添加 DATABASE_URL（详见 README 交付说明）。')
    return
  }

  // dotenv 只负责把 .env.local 加载进 process.env，绝不打印内容
  dotenv.config({path: ENV_PATH, override: false})

  const connectionString = (process.env.DATABASE_URL || '').trim()
  if (!connectionString) {
    fail('未在 .env.local 中找到 DATABASE_URL。请添加下面这一行后重试（把方括号内容替换为真实值）：')
    console.error('        DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres')
    return
  }

  if (!fs.existsSync(SCHEMA_PATH)) {
    fail(`未找到 supabase_schema.sql（期望路径：${SCHEMA_PATH}）`)
    return
  }

  log('已读取 DATABASE_URL（内容已隐藏）')

  const client = new Client({
    connectionString,
    ssl: {rejectUnauthorized: false},
    application_name: 'planner-db-setup',
  })

  try {
    await client.connect()
    log('已连接数据库')

    await runPreflight(client)

    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8')
    const hasTransaction = /(^|\n)\s*begin\s*;/i.test(sql) && /(^|\n)\s*commit\s*;/i.test(sql)
    log('开始执行 supabase_schema.sql（事务内）')

    // 脚本文件自带 BEGIN/COMMIT；若被人删掉，这里补一层，保证仍然原子执行
    await client.query(hasTransaction ? sql : `begin;\n${sql}\ncommit;`)

    log('schema 执行完成')
  } catch (error) {
    // 出错必须回滚，避免留下"表建了、策略只建一半"的半成品
    try {
      await client.query('ROLLBACK')
    } catch {
      // 预检阶段或连接阶段失败时本来就没有事务，忽略即可
    }
    fail(`执行失败，已回滚：${error?.message || error}`)
    return
  } finally {
    try {
      await client.end()
    } catch {
      // 连接已断开时忽略
    }
  }

  log('✓ 数据库结构已更新完成。请刷新应用页面，确认控制台不再出现"云端结构未更新"警告。')
}

main().catch(error => {
  fail(`未预期的错误：${error?.message || error}`)
})
