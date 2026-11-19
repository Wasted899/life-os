# 个人规划助手

一个本地优先的个人规划管理 Web 应用：把待办、目标、习惯、时间统计、复盘、记账、日历等日常管理需求收敛到一个界面里。数据默认保存在浏览器本地，可选接入 Supabase 实现多设备云同步。

## 技术栈

- React 18 + TypeScript
- Vite 5 + `vite-plugin-pwa`
- React Router 6（HashRouter，静态托管友好；日历与统计页状态走 URL query）
- dayjs（周期键、日期归一与 ISO 周计算）
- Supabase（`@supabase/supabase-js`，可选云同步；Postgres 侧用部分唯一索引兜底写入幂等）
- 无第三方 UI / 图表库：日历时间轴、时间统计环形图与主题全部手写 SVG / CSS
- Vitest + Testing Library（单元与 React 层测试）

## M1 核心特性

- **多视图待办**：清单 / 四象限 / 列表 / 看板 / 时间线多种视角；支持批量操作、拖拽换象限；删除清单时待办自动迁入「收集箱」。
- **四层目标树**：年 → 月 → 周 → 日逐级拆解，父子目标按周期校验，进度支持等权汇总；切换周期查看历史目标。
- **习惯防重复联动**：打卡可顺带记录用时并写入时间统计；习惯与待办联动使用 `habit_id + due_date` 唯一键去重，反复同步不会生成重复待办；删除习惯时清理关联待办并解绑时间块引用。
- **本地优先与云端覆盖保护**：日常读写走本地存储，云端读取失败时不会进入任何覆盖分支；「用本机覆盖云端」前会先强制抓取云端完整快照写入本地备份，快照不完整则中止操作。
- **今日首页**：只读聚合当日待办、习惯、目标进度、重要日子与每日一句，不直接改写数据。
- **每日一句**：按天哈希稳定轮换，支持「换一条」并持久化选择。
- **PWA**：构建产物可安装到桌面/手机，支持离线打开。

## M2 核心特性

- **记账派生余额防漂移**：当前余额一律由「期初 + 该账户全历史流水净额」实时派生，不再读写 `balance` 字段；旧数据在迁移时一次性折算期初，修改期初需二次确认，避免余额随编辑记录反复漂移。
- **备忘录 JSONB 瀑布流**：普通笔记与购物清单共用一张表，清单条目存于 `items` JSONB；卡片按多列瀑布流排布，窄屏自动降为单列。
- **计时器 6 层防重入**：一次会话只落一条时间块，会话标记、确定性主键、内存键、已加载数据比对、ref 唯一与云端幂等 upsert 共同兜底；暂停会被压缩、跨零点自动拆段，不产生 `end > 24` 脏数据。
- **番茄钟复用引擎与跨模块互斥**：番茄钟与计时器共用时间轴、运行时与结束落库逻辑；同账号只允许一个 running 会话，切换页面或心跳过期都不放行，避免统计双计。
- **日历五视图**：月 / 周 / 三日 / 日 / 年视图，`view` 与 `date` 全部走 URL query，刷新、前进后退与分享链接一致；支持从待办、时间统计等页面带日期跳转预选。

## M3 特性

- **四粒度时间统计**：日 / 周 / 月 / 年统一聚合，一次 `O(N)` 遍历建成四层桶索引；手写 SVG 环形图配可点选图例，尾部小分类自动并入「其他」，日视图另附 24 小时轮盘副图。
- **异常数据体检**：越界、倒挂、非数字等异常时间块默认不计入统计，顶栏徽标与横幅提示、明细行标红；侧边抽屉可按原因与日期筛选、批量删除并导出 JSON，疑似重叠只提示不自动删除；日历异常块可一键跳转到体检抽屉。

其余模块：复盘（日/周/月/年）、重要日子、指南、设置（主题皮肤、数据导入导出）、记账（流水/统计/预算/账户/周期账单/年度）。

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

### 开发与测试

人工回归清单：[M1 全量回归](docs/M1-TESTING.md) · [M2 全量回归](docs/M2-TESTING.md)。自动化校验一行：`npx tsc --noEmit; npm test`（PowerShell 用 `;` 连接，bash 用 `&&`）。

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
