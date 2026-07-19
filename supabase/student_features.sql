-- HỒ SƠ, ẢNH ĐẠI DIỆN VÀ BÀI NỘP HỌC SINH — LỚP HỌC THẦY ĐỨC
-- Chạy toàn bộ tệp này trong Supabase > SQL Editor sau student_portal.sql.
-- Có thể chạy lại an toàn. Tệp học sinh chỉ được truy cập qua Edge Function;
-- giáo viên đăng nhập được quyền đọc để kiểm tra hồ sơ và bài đã nộp.

begin;

create table if not exists public.student_profiles (
  student_id text primary key references public.student_accounts(student_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null default '',
  school text not null default '',
  grade_text text not null default '',
  date_of_birth date,
  student_phone text not null default '',
  parent_name text not null default '',
  parent_phone text not null default '',
  address text not null default '',
  note text not null default '',
  avatar_path text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists student_profiles_owner_idx
  on public.student_profiles (owner_id, updated_at desc);

alter table public.student_profiles enable row level security;
revoke all on table public.student_profiles from anon, authenticated;
grant select, insert, update, delete on table public.student_profiles to service_role;
grant select on table public.student_profiles to authenticated;

drop policy if exists "student_profiles_teacher_select" on public.student_profiles;
create policy "student_profiles_teacher_select"
on public.student_profiles for select to authenticated
using ((select auth.uid()) = owner_id);

create table if not exists public.assignment_submissions (
  assignment_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null references public.student_accounts(student_id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  files jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_submissions_files_array check (jsonb_typeof(files) = 'array')
);

create index if not exists assignment_submissions_owner_idx
  on public.assignment_submissions (owner_id, submitted_at desc);

create index if not exists assignment_submissions_student_idx
  on public.assignment_submissions (student_id, submitted_at desc);

alter table public.assignment_submissions enable row level security;
revoke all on table public.assignment_submissions from anon, authenticated;
grant select, insert, update, delete on table public.assignment_submissions to service_role;
grant select on table public.assignment_submissions to authenticated;

drop policy if exists "assignment_submissions_teacher_select" on public.assignment_submissions;
create policy "assignment_submissions_teacher_select"
on public.assignment_submissions for select to authenticated
using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('student-work', 'student-work', false, 15728640)
on conflict (id) do update
set public = false, file_size_limit = 15728640;

-- Học sinh tải lên bằng URL ký ngắn hạn do Edge Function cấp, không được duyệt
-- kho tệp trực tiếp. Giáo viên chỉ đọc/xóa thư mục có UID của chính mình.
drop policy if exists "student_work_teacher_select" on storage.objects;
create policy "student_work_teacher_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'student-work'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "student_work_teacher_delete" on storage.objects;
create policy "student_work_teacher_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'student-work'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;

select
  'READY' as status,
  'Hồ sơ học sinh, ảnh đại diện và bài nộp riêng tư đã sẵn sàng.' as message;
