-- CỔNG HỌC SINH — LỚP HỌC THẦY ĐỨC
-- Chạy TOÀN BỘ tệp này một lần trong Supabase > SQL Editor.
-- Bảng tài khoản không lưu mật khẩu. Mật khẩu chỉ được Supabase Auth quản lý.

begin;

create table if not exists public.student_accounts (
  student_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'locked')),
  must_change_password boolean not null default true,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_accounts_username_format
    check (username ~ '^[a-z0-9][a-z0-9._-]{3,31}$')
);

create index if not exists student_accounts_owner_idx
  on public.student_accounts (owner_id, display_name);

alter table public.student_accounts enable row level security;
revoke all on table public.student_accounts from anon, authenticated;

-- Nhật ký không chứa mật khẩu hoặc mã bí mật.
create table if not exists public.student_account_audit (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id text,
  action text not null,
  actor_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_account_audit_owner_created_idx
  on public.student_account_audit (owner_id, created_at desc);

alter table public.student_account_audit enable row level security;
revoke all on table public.student_account_audit from anon, authenticated;

commit;

select
  'READY' as status,
  'Bảng tài khoản học sinh đã sẵn sàng. Tiếp theo triển khai Edge Function student-portal.' as message;
