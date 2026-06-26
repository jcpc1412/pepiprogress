-- Private photo storage bucket (spec 04/11 — encrypted at rest, signed-URL only, never public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  10485760,   -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp']
);

-- RLS: each user can only touch their own folder ({user_id}/filename)
create policy "photos: owner upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos: owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos: owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
