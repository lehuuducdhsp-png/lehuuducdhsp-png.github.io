-- Chạy toàn bộ đoạn này một lần trong Supabase > SQL Editor.
-- Bảng chỉ cho phép tài khoản đã đăng nhập đọc và ghi đúng dữ liệu của mình.

create table if not exists public.classroom_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.classroom_state enable row level security;

revoke all on table public.classroom_state from anon;
grant select, insert, update on table public.classroom_state to authenticated;

drop policy if exists "classroom_state_select_own" on public.classroom_state;
create policy "classroom_state_select_own"
on public.classroom_state
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "classroom_state_insert_own" on public.classroom_state;
create policy "classroom_state_insert_own"
on public.classroom_state
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "classroom_state_update_own" on public.classroom_state;
create policy "classroom_state_update_own"
on public.classroom_state
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
