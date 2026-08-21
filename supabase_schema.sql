-- ============================================================
-- 个人规划助手 Supabase 建表 SQL
-- 使用方法：复制全部内容，粘贴到 Supabase 项目的 SQL Editor 中运行
-- 注意：id 字段使用 text 类型，兼容前端字符串ID
-- ============================================================

-- ============================================================
-- 1. 待办事项表
-- ============================================================
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
  created_at timestamptz default now()
);

-- ============================================================
-- 2. 待办清单表（多清单）
-- ============================================================
create table if not exists todo_lists (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  color text default '#3b82f6',
  icon text default '📋',
  created_at timestamptz default now()
);

-- ============================================================
-- 3. 分类表
-- ============================================================
create table if not exists categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  color text default '#3b82f6',
  created_at timestamptz default now()
);

-- ============================================================
-- 4. 目标表
-- ============================================================
create table if not exists goals (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  type text default 'year',
  parent_id text,
  progress integer default 0,
  status text default 'active',
  description text,
  created_at timestamptz default now()
);

-- ============================================================
-- 5. 习惯表
-- ============================================================
create table if not exists habits (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  frequency text default 'daily',
  custom_days integer[] default '{}',
  check_dates text[] default '{}',
  category_id text default '',
  created_at timestamptz default now()
);

-- ============================================================
-- 6. 重要日子表（倒计时/正计时）
-- ============================================================
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

-- ============================================================
-- 7. 时间块表（时间统计）
-- ============================================================
create table if not exists time_blocks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  date text not null,
  start numeric not null,
  end numeric not null,
  title text not null,
  category text default '学习',
  source text default 'manual',
  created_at timestamptz default now()
);

-- ============================================================
-- 8. 番茄钟记录表
-- ============================================================
create table if not exists pomodoros (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  date text not null,
  duration integer not null,
  task text default '',
  completed boolean default true,
  mode text default 'countdown',
  created_at timestamptz default now()
);

-- ============================================================
-- 9. 记账流水表
-- ============================================================
create table if not exists transactions (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  date text not null,
  type text not null default 'expense',
  category text not null,
  amount numeric not null,
  account text default '微信',
  note text,
  created_at timestamptz default now()
);

-- ============================================================
-- 10. 备忘录表
-- ============================================================
create table if not exists memos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text,
  content text not null,
  category text default '其他',
  pinned boolean default false,
  completed boolean default false,
  created_at text default '',
  inserted_at timestamptz default now()
);

-- ============================================================
-- 11. 记账分类表
-- ============================================================
create table if not exists finance_categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  type text not null default 'expense',
  color text default '#94a3b8',
  icon text default '📦',
  created_at timestamptz default now()
);

-- ============================================================
-- 12. 账户表
-- ============================================================
create table if not exists accounts (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  balance numeric default 0,
  icon text default '💳',
  created_at timestamptz default now()
);

-- ============================================================
-- 13. 周期账单表
-- ============================================================
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
  created_at timestamptz default now()
);

-- ============================================================
-- 开启 RLS 行安全策略（所有表）
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
-- 创建 RLS 策略（用户只能访问自己的数据）
-- ============================================================
create policy "todos_own" on todos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todo_lists_own" on todo_lists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_own" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_own" on goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habits_own" on habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "important_days_own" on important_days for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "time_blocks_own" on time_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pomodoros_own" on pomodoros for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_own" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "memos_own" on memos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "finance_categories_own" on finance_categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_own" on accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurrings_own" on recurrings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 完成！运行后可以在 Table Editor 中看到14张表
-- ============================================================