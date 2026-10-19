-- Admins obtain signed upload tokens through /api/admin/contests/image-upload.
-- No direct client write policies: the service role issues scoped tokens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contest-images', 'contest-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "contest images are public" on storage.objects;
create policy "contest images are public" on storage.objects for select to anon, authenticated
  using (bucket_id = 'contest-images');
