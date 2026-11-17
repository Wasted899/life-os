-- ============================================================
-- 个人规划助手 · Supabase 完整数据库脚本（幂等版）
-- 版本：M1-6 / 2026-11
--
-- 使用方式（二选一）：
--   1) Supabase 控制台 → SQL Editor → 全选粘贴 → Run
--   2) 本地终端：npm run db:setup（需要 .env.local 里配置 DATABASE_URL）
--
-- 安全承诺：
--   * 只做 create / add column if not exists / 建索引 / 启用 RLS / 建策略 / 授权
--   * 不删表、不删列、不改列类型、不 truncate、不 delete 任何业务数据
--   * 新增列一律 allow null 或带 default，老数据不会被阻塞
--   * 全脚本包在事务里：任何一步失败整体回滚，不会留下半成品
--
-- 结构：
--   0. 预检（time_blocks 的 ref 唯一性，有重复直接中止）
--   A. 13 张业务表：补列 + 索引 + RLS + 策略 + GRANT
--   B. 6 张预留表：reviews / themes / quotes / guides / settings / user_meta
--      （M1-6 代码暂不读写，先建空表，M3 接云同步时无需再跑高风险脚本）
-- ============================================================


-- ============================================================
-- 0. 预检：time_blocks(user_id, ref_type, ref_id) 是否重复
--    有重复会直接 raise exception，后面的建表/索引全部不执行。
--    脚本不会自动删除任何业务数据，请先自行确认并清理。
-- ============================================================
do $$
declare
  detail text;
begin
  if to_regclass('public.time_blocks') is null then
    raise notice '预检：time_blocks 尚不存在，跳过唯一性检查';
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'time_blocks' and column_name = 'ref_type'
  ) then
    raise notice '预检：time_blocks 尚无 ref_type 列，跳过唯一性检查';
    return;
  end if;

  select string_agg(
           format('user_id=%s, ref_type=%s, ref_id=%s, 重复 %s 次', user_id, ref_type, ref_id, cnt),
           E'\n')
    into detail
  from (
    select user_id, ref_type, ref_id, count(*) as cnt
    from time_blocks
    where ref_type is not null and ref_id is not null
    group by user_id, ref_type, ref_id
    having count(*) > 1
  ) d;

  if detail is not null then
    raise exception E'预检失败：time_blocks 存在重复的 (user_id, ref_type, ref_id)：\n%\n请先清理重复数据（脚本不会自动删除），再重新执行。', detail;
  end if;

  raise notice '预检通过：time_blocks 无重复引用';
end $$;


begin;

-- ============================================================
-- A-1. 基础授权（RLS 生效的前提）
-- ============================================================
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;


-- ============================================================
-- A-2. 13 张业务表（新库直接按最新结构创建）
--      已存在的表不会被改动，缺的列由 A-3 补齐
-- ============================================================

-- 1. 待办事项
create table if not exists todos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  priority text default 'q2',
  due_date text,
  due_time text default '',
  completed boolean default false,
  completed_at text,
  list_id text default 'inbox',
  category_id text default '',
  pinned boolean default false,
  status text default 'todo',
  source text default 'manual',
  habit_id text,
  type text default 'task',
  start text,
  "end" text,
  quadrant text default 'q2',
  note text,
  created_at timestamptz default now()
);

-- 2. 待办清单
create table if not exists todo_lists (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  color text default '#3b82f6',
  icon text default '📋',
  created_at timestamptz default now()
);

-- 3. 分类
create table if not exists categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  color text default '#3b82f6',
  icon text default '📁',
  created_at timestamptz default now()
);

-- 4. 目标
create table if not exists goals (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  type text default 'year',
  parent_id text,
  progress integer default 0,
  status text default 'active',
  description text,
  level text default 'year',
  period_key text,
  start_date text,
  end_date text,
  created_at timestamptz default now()
);

-- 5. 习惯
create table if not exists habits (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  frequency text default 'daily',
  custom_days integer[] default '{}',
  check_dates text[] default '{}',
  category_id text default '',
  name text,
  target_count integer default 1,
  target_period text default 'week',
  monthly_day integer,
  day_of_month integer,
  created_at timestamptz default now()
);

-- 6. 重要日子
create table if not exists important_days (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  date text not null,
  category text default '其他',
  pinned boolean default false,
  type text default 'countdown',
  created_at timestamptz default now()
);

-- 7. 时间块
create table if not exists time_blocks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  date text not null,
  start numeric not null,
  "end" numeric not null,
  title text not null,
  category text default '学习',
  source text default 'manual',
  duration numeric,
  ref_type text,
  ref_id text,
  created_at timestamptz default now()
);

-- 8. 番茄钟记录
create table if not exists pomodoros (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  date text not null,
  duration integer not null,
  task text default '',
  completed boolean default true,
  mode text default 'countdown',
  task_id text,
  task_label text,
  tag text,
  created_at timestamptz default now()
);

-- 9. 记账流水
create table if not exists transactions (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  date text not null,
  type text not null default 'expense',
  category text not null,
  amount numeric not null,
  account text default '微信',
  note text,
  account_id text,
  recurring_id text,
  created_at timestamptz default now()
);

-- 10. 备忘录
--     注意：created_at 是"业务时间"（前端写入的 ISO 字符串），inserted_at 是"入库时间"
create table if not exists memos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text,
  content text not null default '',
  category text default '其他',
  pinned boolean default false,
  completed boolean default false,
  created_at text default '',
  inserted_at timestamptz default now()
);

-- 11. 记账分类
create table if not exists finance_categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  type text not null default 'expense',
  color text default '#94a3b8',
  icon text default '📦',
  created_at timestamptz default now()
);

-- 12. 账户
create table if not exists accounts (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  balance numeric default 0,
  icon text default '💳',
  created_at timestamptz default now()
);

-- 13. 周期账单
create table if not exists recurrings (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  amount numeric not null,
  cycle text default 'monthly',
  day integer default 1,
  category text default '其他',
  account text default '微信',
  start_date text default '',
  next_date text,
  custom_period text,
  paused boolean default false,
  created_at timestamptz default now()
);


-- ============================================================
-- A-3. 老库补列（全部 allow null 或带 default，不会阻塞已有行）
-- ============================================================
alter table todos add column if not exists type text default 'task';
alter table todos add column if not exists start text;
alter table todos add column if not exists "end" text;
alter table todos add column if not exists quadrant text default 'q2';
alter table todos add column if not exists note text;

alter table goals add column if not exists level text default 'year';
alter table goals add column if not exists period_key text;
alter table goals add column if not exists start_date text;
alter table goals add column if not exists end_date text;

alter table habits add column if not exists name text;
alter table habits add column if not exists target_count integer default 1;
alter table habits add column if not exists target_period text default 'week';
alter table habits add column if not exists monthly_day integer;
alter table habits add column if not exists day_of_month integer;

alter table categories add column if not exists icon text default '📁';

alter table time_blocks add column if not exists duration numeric;
alter table time_blocks add column if not exists ref_type text;
alter table time_blocks add column if not exists ref_id text;

alter table pomodoros add column if not exists task_id text;
alter table pomodoros add column if not exists task_label text;
alter table pomodoros add column if not exists tag text;

alter table transactions add column if not exists account_id text;
alter table transactions add column if not exists recurring_id text;

alter table accounts add column if not exists opening_balance numeric;

alter table recurrings add column if not exists next_date text;
alter table recurrings add column if not exists custom_period text;
alter table recurrings add column if not exists type text default 'expense';
alter table recurrings add column if not exists account_id text;
alter table recurrings add column if not exists paused boolean default false;


-- ============================================================
-- A-4. 索引（按 user_id 过滤是每次登录的必经路径）
-- ============================================================
create index if not exists idx_todos_user on todos(user_id);
create index if not exists idx_todos_user_due on todos(user_id, due_date);
create index if not exists idx_todo_lists_user on todo_lists(user_id);
create index if not exists idx_categories_user on categories(user_id);
create index if not exists idx_goals_user on goals(user_id);
create index if not exists idx_habits_user on habits(user_id);
create index if not exists idx_important_days_user_date on important_days(user_id, date);
create index if not exists idx_time_blocks_user_date on time_blocks(user_id, date);
create index if not exists idx_pomodoros_user_date on pomodoros(user_id, date);
create index if not exists idx_transactions_user_date on transactions(user_id, date);
create index if not exists idx_memos_user on memos(user_id);
create index if not exists idx_finance_categories_user on finance_categories(user_id);
create index if not exists idx_accounts_user on accounts(user_id);
create index if not exists idx_recurrings_user on recurrings(user_id);

-- 同一来源（待办/习惯/番茄钟）只能落一条时间块，避免重复计时
-- 使用部分唯一索引：ref_type / ref_id 为空的手动时间块不受限制
create unique index if not exists uq_time_blocks_ref
  on time_blocks (user_id, ref_type, ref_id)
  where ref_type is not null and ref_id is not null;


-- ============================================================
-- A-5. 启用 RLS（幂等）
-- ============================================================
alter table todos enable row level security;
alter table todo_lists enable row level security;
alter table categories enable row level security;
alter table goals enable row level security;
alter table habits enable row level security;
alter table important_days enable row level security;
alter table time_blocks enable row level security;
alter table pomodoros enable row level security;
alter table transactions enable row level security;
alter table memos enable row level security;
alter table finance_categories enable row level security;
alter table accounts enable row level security;
alter table recurrings enable row level security;


-- ============================================================
-- A-6. RLS 策略（drop + create 保证可重复执行）
--      只允许已登录用户读写自己的行
-- ============================================================
drop policy if exists "todos_own" on todos;
create policy "todos_own" on todos for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "todo_lists_own" on todo_lists;
create policy "todo_lists_own" on todo_lists for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "categories_own" on categories;
create policy "categories_own" on categories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goals_own" on goals;
create policy "goals_own" on goals for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "habits_own" on habits;
create policy "habits_own" on habits for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "important_days_own" on important_days;
create policy "important_days_own" on important_days for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "time_blocks_own" on time_blocks;
create policy "time_blocks_own" on time_blocks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pomodoros_own" on pomodoros;
create policy "pomodoros_own" on pomodoros for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions_own" on transactions;
create policy "transactions_own" on transactions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "memos_own" on memos;
create policy "memos_own" on memos for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "finance_categories_own" on finance_categories;
create policy "finance_categories_own" on finance_categories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "accounts_own" on accounts;
create policy "accounts_own" on accounts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "recurrings_own" on recurrings;
create policy "recurrings_own" on recurrings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- 明确收回匿名角色的权限（RLS 已兜底，这里再收紧一层）
revoke all on table todos, todo_lists, categories, goals, habits, important_days,
  time_blocks, pomodoros, transactions, memos, finance_categories, accounts, recurrings
  from anon;


-- ============================================================
-- B. 6 张预留表（本轮代码不读写，先建空表）
--    所有列允许 null 或带 default，M3 接入时直接可用
-- ============================================================

-- 14. 复盘（日/周/月/年共用）
create table if not exists reviews (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  period_type text not null default 'daily',
  period_key text not null default '',
  mood integer,
  sections jsonb default '{}'::jsonb,
  created_at text default '',
  updated_at text,
  inserted_at timestamptz default now()
);

-- 15. 主题
create table if not exists themes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null default '未命名主题',
  primary_color text default '#3b82f6',
  sidebar_color text default '#0f172a',
  bg text,
  bg_image text,
  overlay numeric,
  blur integer,
  custom boolean default false,
  icon_set text,
  created_at timestamptz default now()
);

-- 16. 每日一句
create table if not exists quotes (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  content text not null default '',
  author text default '',
  author_title text,
  source_type text default 'quote',
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- 17. 指南条目
create table if not exists guides (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  category text not null default '',
  title text not null default '',
  icon text,
  body text[] default '{}',
  links jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 18. 应用设置（每个用户一行）
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade not null default auth.uid(),
  disabled_modules text[] default '{}',
  font_scale numeric default 1,
  updated_at timestamptz default now()
);

-- 19. 用户资料（每个用户一行）
create table if not exists user_meta (
  user_id uuid primary key references auth.users(id) on delete cascade not null default auth.uid(),
  nickname text,
  avatar text,
  email text,
  updated_at timestamptz default now()
);

create index if not exists idx_reviews_user_period on reviews(user_id, period_type, period_key);
create index if not exists idx_themes_user on themes(user_id);
create index if not exists idx_quotes_user on quotes(user_id);
create index if not exists idx_guides_user on guides(user_id);

alter table reviews enable row level security;
alter table themes enable row level security;
alter table quotes enable row level security;
alter table guides enable row level security;
alter table settings enable row level security;
alter table user_meta enable row level security;

drop policy if exists "reviews_own" on reviews;
create policy "reviews_own" on reviews for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "themes_own" on themes;
create policy "themes_own" on themes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "quotes_own" on quotes;
create policy "quotes_own" on quotes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "guides_own" on guides;
create policy "guides_own" on guides for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_own" on settings;
create policy "settings_own" on settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_meta_own" on user_meta;
create policy "user_meta_own" on user_meta for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table reviews, themes, quotes, guides, settings, user_meta from anon;


-- ============================================================
-- B-2. 二次授权（覆盖本次新建的表）
--      `grant ... on all tables` 只作用于执行瞬间已存在的表，
--      所以建完新表必须再执行一次。
-- ============================================================
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;


-- ============================================================
-- 自检（只读，输出在 SQL Editor 的 Results 里）
-- ============================================================
select table_name, count(*) as column_count
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'todos','todo_lists','categories','goals','habits','important_days',
    'time_blocks','pomodoros','transactions','memos','finance_categories',
    'accounts','recurrings','reviews','themes','quotes','guides','settings','user_meta'
  )
group by table_name
order by table_name;

select tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

commit;
