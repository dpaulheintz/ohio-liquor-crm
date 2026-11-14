-- EOS: photos and files on Opportunities.
--
-- Access matches the rest of EOS exactly: the same 6-email allowlist the eos_users_allowed policies
-- use (src/lib/eos-auth.ts). Nobody's access changes; the existing EOS policies are untouched.
-- Files live in the private bucket eos-opportunity-files and are only ever served via signed URLs.
-- Delete: the uploader or an EOS admin (Paul, Adam).

-- ─── Helpers (same lists as eos_users_allowed / src/lib/eos-auth.ts) ─────────

create or replace function public.eos_is_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'pheintzman@highbankco.com', 'ahines@highbankco.com', 'jfisher@highbankco.com',
    'jireland@highbankco.com', 'msmith@highbankco.com', 'ccarter@highbankco.com');
$$;

create or replace function public.eos_is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('pheintzman@highbankco.com', 'ahines@highbankco.com');
$$;

revoke execute on function public.eos_is_user() from public, anon;
revoke execute on function public.eos_is_admin() from public, anon;
grant execute on function public.eos_is_user() to authenticated;
grant execute on function public.eos_is_admin() to authenticated;

-- ─── Attachments ──────────────────────────────────────────────────────────────

create table public.eos_opportunity_attachments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.eos_opportunities(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400), -- 25 MB
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null, -- set on insert (policy checks it)
  created_at timestamptz not null default now()
);
create index eos_opportunity_attachments_opp_idx on public.eos_opportunity_attachments (opportunity_id, created_at);

alter table public.eos_opportunity_attachments enable row level security;
revoke all on public.eos_opportunity_attachments from anon;
grant select, insert, delete on public.eos_opportunity_attachments to authenticated;

create policy eos_attachments_select on public.eos_opportunity_attachments
  for select to authenticated using (public.eos_is_user());
create policy eos_attachments_insert on public.eos_opportunity_attachments
  for insert to authenticated with check (public.eos_is_user() and uploaded_by = auth.uid());
create policy eos_attachments_delete on public.eos_opportunity_attachments
  for delete to authenticated using (public.eos_is_user() and (uploaded_by = auth.uid() or public.eos_is_admin()));

-- Realtime so the meeting runner sees new attachments (and 📎 counts) live.
alter publication supabase_realtime add table public.eos_opportunity_attachments;

-- ─── Private storage bucket ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eos-opportunity-files', 'eos-opportunity-files', false, 26214400, array[
  'image/jpeg', 'image/png',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy eos_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'eos-opportunity-files' and public.eos_is_user());

create policy eos_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'eos-opportunity-files' and public.eos_is_user());

-- Delete: the uploader or an EOS admin; or, once the attachment row is gone (row deleted first, or
-- the opportunity was deleted and its rows cascaded), any EOS user may clear the leftover object.
create policy eos_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'eos-opportunity-files' and public.eos_is_user() and (
      public.eos_is_admin()
      or not exists (select 1 from public.eos_opportunity_attachments a where a.storage_path = storage.objects.name)
      or exists (select 1 from public.eos_opportunity_attachments a where a.storage_path = storage.objects.name and a.uploaded_by = auth.uid())
    )
  );
