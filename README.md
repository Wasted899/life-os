# 个人规划助手

一个本地优先的个人规划管理 Web 应用：把待办、目标、习惯、时间统计、复盘、记账、日历等日常管理需求收敛到一个界面里。数据默认保存在浏览器本地，可选接入 Supabase 实现多设备云同步。

## 技术栈

- React 18 + TypeScript
- Vite 5 + `vite-plugin-pwa`
- React Router 6（HashRouter，静态托管友好）
- dayjs
- Supabase（`@supabase/supabase-js`，可选云同步）
- Vitest + Testing Library（单元与 React 层测试）

## M1 核心特性

- **多视图待办**：清单 / 四象限 / 列表 / 看板 / 时间线多种视角；支持批量操作、拖拽换象限；删除清单时待办自动迁入「收集箱」。
- **四层目标树**：年 → 月 → 周 → 日逐级拆解，父子目标按周期校验，进度支持等权汇总；切换周期查看历史目标。
- **习惯防重复联动**：打卡可顺带记录用时并写入时间统计；习惯与待办联动使用 `habit_id + due_date` 唯一键去重，反复同步不会生成重复待办；删除习惯时清理关联待办并解绑时间块引用。
- **本地优先与云端覆盖保护**：日常读写走本地存储，云端读取失败时不会进入任何覆盖分支；「用本机覆盖云端」前会先强制抓取云端完整快照写入本地备份，快照不完整则中止操作。
- **今日首页**：只读聚合当日待办、习惯、目标进度、重要日子与每日一句，不直接改写数据。
- **每日一句**：按天哈希稳定轮换，支持「换一条」并持久化选择。
- **PWA**：构建产物可安装到桌面/手机，支持离线打开。

其余模块：日历（月/周/日/年）、时间统计、番茄钟、复盘（日/周/月/年）、重要日子、备忘录、记账（流水/统计/预算/账户/周期账单/年度）、指南、设置（主题皮肤、数据导入导出）。

## 本地启动

环境要求：Node.js 18+。

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量模板（Windows PowerShell 用 Copy-Item）
cp .env.local.example .env.local

# 3. 编辑 .env.local 填入自己的配置（见下方说明）

# 4. 初始化数据库（需要 DATABASE_URL，只需执行一次；重复执行是幂等的）
npm run db:setup

# 5. 启动开发服务器
npm run dev
```

默认地址：<http://localhost:5173>

### `.env.local` 配置项

| 变量 | 必填 | 用途 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | 接入云同步时必填 | Supabase 项目 URL，形如 `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 接入云同步时必填 | Supabase 项目的 anon public key（不要使用 service_role key） |
| `DATABASE_URL` | 仅 `npm run db:setup` 需要 | PostgreSQL 连接串，供本地建库脚本使用；不以 `VITE_` 开头，不会打进前端产物 |

`DATABASE_URL` 示例（仅占位符，请替换为自己的值）：

```text
postgresql://postgres.<project-ref>:<your-password>@<pooler-host>:5432/postgres
```

不填 Supabase 配置时，应用以纯本地模式运行，功能可用，只是没有多设备同步。`npm run db:setup` 会读取 `supabase_schema.sql` 并在一个事务内建表，任一步失败会回滚。

## 测试与构建

```bash
npm test            # Vitest 全量测试
npx tsc --noEmit    # 仅类型检查
npm run build       # 类型检查 + 生产构建，产物在 dist/
npm run preview     # 本地预览生产构建
```

## 目录结构

```text
src/
  core/        # 类型、存储、云同步、迁移、通用 UI（Modal 等）
  context/     # DataContext：13 域数据与读写入口
  features/    # 按业务域拆分的页面：todos / goals / habits / today / ...
  styles/      # 全局样式（themes.css）
scripts/       # setup-db.js 数据库初始化脚本
supabase_schema.sql
```

## 云同步（可选）

1. 在 Supabase 创建项目；
2. 在 SQL Editor 执行 `supabase_schema.sql`，或配置好 `DATABASE_URL` 后运行 `npm run db:setup`；
3. 将 `.env.local.example` 复制为 `.env.local`，填入 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`；
4. 重新启动 `npm run dev`。

仓库中不包含任何真实连接串、密钥或项目标识；请只在自己的本地 `.env.local` 中保存。
