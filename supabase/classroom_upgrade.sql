-- NÂNG CẤP AN TOÀN DỮ LIỆU LỚP HỌC
-- Chạy toàn bộ tệp này một lần trong Supabase > SQL Editor sau khi website mới được xuất bản.

alter table public.classroom_state
  add column if not exists revision bigint not null default 1;

create table if not exists public.classroom_state_history (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  data jsonb not null,
  action text not null default 'Cập nhật dữ liệu',
  device_id text,
  created_at timestamptz not null default now()
);

create index if not exists classroom_state_history_owner_created_idx
  on public.classroom_state_history (owner_id, created_at desc);

alter table public.classroom_state_history enable row level security;
revoke all on table public.classroom_state_history from anon;
grant select on table public.classroom_state_history to authenticated;

drop policy if exists "classroom_state_history_select_own" on public.classroom_state_history;
create policy "classroom_state_history_select_own"
on public.classroom_state_history
for select
to authenticated
using (auth.uid() = owner_id);

create or replace function public.save_classroom_state(
  p_data jsonb,
  p_expected_revision bigint,
  p_action text default 'Cập nhật dữ liệu',
  p_device_id text default null
)
returns table (
  ok boolean,
  conflict boolean,
  new_revision bigint,
  saved_at timestamptz,
  current_data jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current public.classroom_state%rowtype;
  v_now timestamptz := now();
  v_next bigint;
begin
  if v_owner is null then
    raise exception 'authentication required';
  end if;

  select * into v_current
  from public.classroom_state
  where owner_id = v_owner
  for update;

  if v_current.owner_id is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      return query select false, true, 0::bigint, null::timestamptz, null::jsonb;
      return;
    end if;

    insert into public.classroom_state (owner_id, data, revision, updated_at)
    values (v_owner, p_data, 1, v_now);

    return query select true, false, 1::bigint, v_now, p_data;
    return;
  end if;

  if v_current.revision <> coalesce(p_expected_revision, 0) then
    return query
      select false, true, v_current.revision, v_current.updated_at, v_current.data;
    return;
  end if;

  insert into public.classroom_state_history
    (owner_id, revision, data, action, device_id, created_at)
  values
    (v_owner, v_current.revision, v_current.data,
     left(coalesce(nullif(p_action, ''), 'Cập nhật dữ liệu'), 200),
     left(coalesce(p_device_id, ''), 120), v_now);

  v_next := v_current.revision + 1;
  update public.classroom_state
  set data = p_data,
      revision = v_next,
      updated_at = v_now
  where owner_id = v_owner;

  delete from public.classroom_state_history h
  where h.owner_id = v_owner
    and h.id in (
      select old.id
      from public.classroom_state_history old
      where old.owner_id = v_owner
      order by old.created_at desc
      offset 100
    );

  return query select true, false, v_next, v_now, p_data;
end;
$$;

revoke all on function public.save_classroom_state(jsonb, bigint, text, text) from public;
grant execute on function public.save_classroom_state(jsonb, bigint, text, text) to authenticated;

-- Sau nâng cấp, ứng dụng chỉ ghi qua hàm có kiểm tra phiên bản để tránh ghi đè giữa hai thiết bị.
revoke insert, update, delete on table public.classroom_state from authenticated;
grant select on table public.classroom_state to authenticated;

