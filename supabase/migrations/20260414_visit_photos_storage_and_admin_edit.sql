-- Storage policies for visit-photos bucket
drop policy if exists "visit_photos_select" on storage.objects;
create policy "visit_photos_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'visit-photos');

drop policy if exists "visit_photos_insert" on storage.objects;
create policy "visit_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'visit-photos');

drop policy if exists "visit_photos_delete" on storage.objects;
create policy "visit_photos_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'visit-photos'
    and (owner = auth.uid() or public.is_admin())
  );

-- Allow admins to update any visit, not just their own
drop policy if exists "Users can update own visits" on public.visit_logs;
drop policy if exists "Users can update own visits, admins any" on public.visit_logs;
create policy "Users can update own visits, admins any"
  on public.visit_logs for update
  to authenticated
  using (rep_id = auth.uid() or public.is_admin())
  with check (rep_id = auth.uid() or public.is_admin());

-- Allow admins to delete visit_photos of any visit
drop policy if exists "Approved users can delete own visit photos" on public.visit_photos;
drop policy if exists "Users can delete own visit photos, admins any" on public.visit_photos;
create policy "Users can delete own visit photos, admins any"
  on public.visit_photos for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.visit_logs
      where visit_logs.id = visit_photos.visit_id
        and visit_logs.rep_id = auth.uid()
    )
  );
