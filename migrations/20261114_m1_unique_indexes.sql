-- ============================================================
-- 个人规划助手 · M1 唯一索引补丁（M1-13 收尾 / M1-17 前置）
-- 目标：
--   1) time_blocks (user_id, ref_type, ref_id) 部分唯一索引
--   2) todos       (user_id, habit_id, due_date) 部分唯一索引
--
-- 特性：
--   * 幂等：重复执行不会报错（create unique index if not exists）
--   * 不改表结构、不删数据、不修改任何业务行
--   * 建索引前先查重；有重复会中止并列出样例，等人工处理后再重跑
--   * 整体包在事务里：预检失败或建索引失败都会整体回滚
--
-- 使用方式：
--   Supabase 控制台 → SQL Editor → 全文粘贴 → Run
--
-- 说明：
--   * time_blocks 只约束"有引用"的时间块；ref_type / ref_id 为空的手动时间块不受影响
--   * todos 只约束习惯生成的待办；habit_id 为空的手工待办不受影响
--   * user_id 为空的行不参与预检（唯一索引对 NULL 本身也不判重）
-- ============================================================

begin;

-- ============================================================
-- 0. 预检：先查重，有重复直接中止，不删任何数据
-- ============================================================
do $$
declare
  detail text;
  dup_groups bigint;
begin
  -- ---------- 0.1 time_blocks ----------
  if to_regclass('public.time_blocks') is null then
    raise notice '预检：time_blocks 不存在，跳过';
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'time_blocks' and column_name = 'ref_type'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'time_blocks' and column_name = 'ref_id'
  ) then
    raise notice '预检：time_blocks 缺少 ref_type / ref_id 列，跳过';
  else
    select count(*) into dup_groups
    from (
      select 1
      from public.time_blocks
      where user_id is not null and ref_type is not null and ref_id is not null
      group by user_id, ref_type, ref_id
      having count(*) > 1
    ) d;

    if dup_groups > 0 then
      select string_agg(
               format('user_id=%s, ref_type=%s, ref_id=%s, 重复=%s 条, ids=%s',
                      user_id, ref_type, ref_id, cnt, ids),
               E'\n')
        into detail
      from (
        select user_id, ref_type, ref_id, count(*) as cnt,
               string_agg(id::text, ', ' order by id::text) as ids
        from public.time_blocks
        where user_id is not null and ref_type is not null and ref_id is not null
        group by user_id, ref_type, ref_id
        having count(*) > 1
      ) d;

      raise exception E'预检失败：time_blocks 存在 % 组重复的 (user_id, ref_type, ref_id)。\n%\n\n脚本不会自动删除数据。请先按文件末尾"重复数据处理"人工清理，再重新执行本脚本。', dup_groups, detail;
    end if;

    raise notice '预检通过：time_blocks 无重复引用';
  end if;

  -- ---------- 0.2 todos ----------
  if to_regclass('public.todos') is null then
    raise notice '预检：todos 不存在，跳过';
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'todos' and column_name = 'habit_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'todos' and column_name = 'due_date'
  ) then
    raise notice '预检：todos 缺少 habit_id / due_date 列，跳过';
  else
    select count(*) into dup_groups
    from (
      select 1
      from public.todos
      where user_id is not null and habit_id is not null and due_date is not null
      group by user_id, habit_id, due_date
      having count(*) > 1
    ) d;

    if dup_groups > 0 then
      select string_agg(
               format('user_id=%s, habit_id=%s, due_date=%s, 重复=%s 条, ids=%s',
                      user_id, habit_id, due_date, cnt, ids),
               E'\n')
        into detail
      from (
        select user_id, habit_id, due_date, count(*) as cnt,
               string_agg(id::text, ', ' order by id::text) as ids
        from public.todos
        where user_id is not null and habit_id is not null and due_date is not null
        group by user_id, habit_id, due_date
        having count(*) > 1
      ) d;

      raise exception E'预检失败：todos 存在 % 组重复的 (user_id, habit_id, due_date)。\n%\n\n脚本不会自动删除数据。请先按文件末尾"重复数据处理"人工清理，再重新执行本脚本。', dup_groups, detail;
    end if;

    raise notice '预检通过：todos 无重复习惯待办';
  end if;
end $$;

-- ============================================================
-- 1. time_blocks：同一引用只允许一个时间块
--    为空的手动时间块不受限制
-- ============================================================
do $$
begin
  if to_regclass('public.time_blocks') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'time_blocks' and column_name = 'ref_type'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'time_blocks' and column_name = 'ref_id'
     ) then
    execute 'create unique index if not exists uq_time_blocks_ref
             on public.time_blocks (user_id, ref_type, ref_id)
             where ref_type is not null and ref_id is not null';
    raise notice 'OK：time_blocks 唯一索引 uq_time_blocks_ref 已就绪';
  else
    raise notice '跳过：time_blocks 或 ref_type/ref_id 列不存在';
  end if;
end $$;

-- ============================================================
-- 2. todos：同一习惯同一天只允许一条待办
--    habit_id 为空的手工待办不受限制
-- ============================================================
do $$
begin
  if to_regclass('public.todos') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'todos' and column_name = 'habit_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'todos' and column_name = 'due_date'
     ) then
    execute 'create unique index if not exists uq_todos_habit_due
             on public.todos (user_id, habit_id, due_date)
             where habit_id is not null';
    raise notice 'OK：todos 唯一索引 uq_todos_habit_due 已就绪';
  else
    raise notice '跳过：todos 或 habit_id/due_date 列不存在';
  end if;
end $$;

commit;

-- ============================================================
-- 3. 重复数据处理（只读排查，可在预检失败后单独执行）
--    脚本本身绝不删除数据；确认后再手工处理，然后重跑本文件。
-- ============================================================

-- 3.1 查看 time_blocks 重复组
-- select user_id, ref_type, ref_id,
--        count(*) as cnt,
--        string_agg(id::text, ', ' order by id::text) as ids
-- from public.time_blocks
-- where user_id is not null and ref_type is not null and ref_id is not null
-- group by user_id, ref_type, ref_id
-- having count(*) > 1
-- order by cnt desc;

-- 3.2 查看 todos 重复组
-- select user_id, habit_id, due_date,
--        count(*) as cnt,
--        string_agg(id::text, ', ' order by id::text) as ids
-- from public.todos
-- where user_id is not null and habit_id is not null and due_date is not null
-- group by user_id, habit_id, due_date
-- having count(*) > 1
-- order by cnt desc;

-- 3.3 处理建议（三选一，确认后手工执行；本文件默认全部注释）
--   A. 保留一条，把其余行的引用改到别的实体（不丢业务数据）：
--      update public.todos set habit_id = null where id in ('重复行 id');
--   B. 保留一条，其余行确实属于脏数据时再删除：
--      delete from public.todos where id in ('重复行 id');
--   C. 时间块重复（例如同一次完成被写了两遍）：
--      delete from public.time_blocks where id in ('重复行 id');
--   处理完后重新执行本文件即可。
