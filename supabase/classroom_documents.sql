-- Chạy toàn bộ tệp này một lần trong Supabase > SQL Editor.
-- Kho tài liệu là riêng tư; mỗi tài khoản chỉ truy cập thư mục mang UID của mình.

insert into storage.buckets (id, name, public, file_size_limit)
values ('classroom-documents', 'classroom-documents', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = 26214400;

drop policy if exists "classroom_documents_select_own" on storage.objects;
create policy "classroom_documents_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'classroom-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "classroom_documents_insert_own" on storage.objects;
create policy "classroom_documents_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'classroom-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "classroom_documents_update_own" on storage.objects;
create policy "classroom_documents_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'classroom-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'classroom-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "classroom_documents_delete_own" on storage.objects;
create policy "classroom_documents_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'classroom-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
