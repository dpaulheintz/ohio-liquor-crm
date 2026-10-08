-- Secret Shopper: public restaurant review form + admin dashboard.
-- Anonymous shoppers may only INSERT. Admins read everything and may update gift card fields only.

-- ─── Visits ──────────────────────────────────────────────────────────────────

create table public.secret_shopper_visits (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('Grandview', 'Westerville', 'Gahanna', 'PO Box 21')),
  visit_date date not null,
  service_type text not null check (service_type in ('Bar', 'Table')),

  outside_rating   smallint check (outside_rating   between 1 and 5), outside_notes   text check (char_length(outside_notes)   <= 5000),
  hostess_rating   smallint check (hostess_rating   between 1 and 5), hostess_notes   text check (char_length(hostess_notes)   <= 5000),
  ambiance_rating  smallint check (ambiance_rating  between 1 and 5), ambiance_notes  text check (char_length(ambiance_notes)  <= 5000),
  table_rating     smallint check (table_rating     between 1 and 5), table_notes     text check (char_length(table_notes)     <= 5000),
  server_rating    smallint check (server_rating    between 1 and 5), server_notes    text check (char_length(server_notes)    <= 5000),
  food_rating      smallint check (food_rating      between 1 and 5), food_notes      text check (char_length(food_notes)      <= 5000),
  restroom_rating  smallint check (restroom_rating  between 1 and 5), restroom_notes  text check (char_length(restroom_notes)  <= 5000),
  check_rating     smallint check (check_rating     between 1 and 5), check_notes     text check (char_length(check_notes)     <= 5000),
  departure_rating smallint check (departure_rating between 1 and 5), departure_notes text check (char_length(departure_notes) <= 5000),

  overall_score numeric(3, 2),
  ticket_time_seconds integer check (ticket_time_seconds between 0 and 21600),
  ticket_time_source text check (ticket_time_source in ('timer', 'manual')),
  order_placed_at timestamptz,
  food_delivered_at timestamptz,

  shopper_email text not null check (char_length(shopper_email) <= 320 and shopper_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  gift_card_status text not null default 'pending' check (gift_card_status in ('pending', 'sent')),
  gift_card_sent_at timestamptz,
  gift_card_sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index secret_shopper_visits_visit_date_idx on public.secret_shopper_visits (visit_date desc);
create index secret_shopper_visits_email_idx on public.secret_shopper_visits (lower(shopper_email));

-- Server-authoritative derived fields. Anonymous inserts can't forge the score,
-- the ticket time, or a "sent" gift card.
create or replace function public.secret_shopper_visits_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.visit_date > current_date + 1 or new.visit_date < date '2024-01-01' then
    raise exception 'visit_date out of range';
  end if;

  new.overall_score := (
    select round(avg(r)::numeric, 2)
    from unnest(array[
      new.outside_rating, new.hostess_rating, new.ambiance_rating,
      new.table_rating, new.server_rating, new.food_rating,
      new.restroom_rating, new.check_rating, new.departure_rating
    ]) as r
  );

  if new.order_placed_at is not null and new.food_delivered_at is not null then
    if new.food_delivered_at < new.order_placed_at then
      raise exception 'food_delivered_at precedes order_placed_at';
    end if;
    new.ticket_time_seconds := round(extract(epoch from new.food_delivered_at - new.order_placed_at))::integer;
    new.ticket_time_source := 'timer';
  elsif new.ticket_time_seconds is not null then
    new.ticket_time_source := 'manual';
  else
    new.ticket_time_source := null;
  end if;

  new.shopper_email := lower(trim(new.shopper_email));
  new.gift_card_status := 'pending';
  new.gift_card_sent_at := null;
  new.gift_card_sent_by := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger secret_shopper_visits_before_insert
  before insert on public.secret_shopper_visits
  for each row execute function public.secret_shopper_visits_before_insert();

-- Gift card bookkeeping: who/when is recorded by the database, not the client.
create or replace function public.secret_shopper_visits_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.gift_card_status = 'sent' and old.gift_card_status <> 'sent' then
    new.gift_card_sent_at := now();
    new.gift_card_sent_by := auth.uid();
  elsif new.gift_card_status = 'pending' then
    new.gift_card_sent_at := null;
    new.gift_card_sent_by := null;
  end if;
  return new;
end;
$$;

create trigger secret_shopper_visits_before_update
  before update on public.secret_shopper_visits
  for each row execute function public.secret_shopper_visits_before_update();

-- ─── Media ───────────────────────────────────────────────────────────────────

create table public.secret_shopper_media (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.secret_shopper_visits(id) on delete cascade,
  section text check (section in ('outside', 'hostess', 'ambiance', 'table', 'server', 'food', 'restroom', 'check', 'departure')),
  media_type text not null check (media_type in ('photo', 'video')),
  storage_path text not null check (storage_path like 'visits/' || visit_id::text || '/%' and char_length(storage_path) <= 300),
  created_at timestamptz not null default now()
);

create index secret_shopper_media_visit_idx on public.secret_shopper_media (visit_id);

-- Cap media per visit (10 photos, 3 videos). SECURITY DEFINER so the count sees
-- rows the anonymous inserter is not allowed to SELECT.
create or replace function public.secret_shopper_media_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing integer;
begin
  select count(*) into existing
  from public.secret_shopper_media
  where visit_id = new.visit_id and media_type = new.media_type;

  if (new.media_type = 'photo' and existing >= 10) or (new.media_type = 'video' and existing >= 3) then
    raise exception 'media limit reached for this visit';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger secret_shopper_media_before_insert
  before insert on public.secret_shopper_media
  for each row execute function public.secret_shopper_media_before_insert();

-- ─── Rate limiting (service role only) ───────────────────────────────────────

create table public.secret_shopper_rate_events (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  kind text not null check (kind in ('submit', 'upload')),
  created_at timestamptz not null default now()
);

create index secret_shopper_rate_events_lookup_idx
  on public.secret_shopper_rate_events (ip_hash, kind, created_at desc);

-- ─── RLS + grants ────────────────────────────────────────────────────────────

alter table public.secret_shopper_visits enable row level security;
alter table public.secret_shopper_media enable row level security;
alter table public.secret_shopper_rate_events enable row level security;

revoke all on public.secret_shopper_visits from anon, authenticated;
revoke all on public.secret_shopper_media from anon, authenticated;
revoke all on public.secret_shopper_rate_events from anon, authenticated;

grant insert on public.secret_shopper_visits to anon;
grant insert on public.secret_shopper_media to anon;
grant select on public.secret_shopper_visits to authenticated;
grant select on public.secret_shopper_media to authenticated;
grant update (gift_card_status, gift_card_sent_at, gift_card_sent_by) on public.secret_shopper_visits to authenticated;

create policy secret_shopper_visits_anon_insert on public.secret_shopper_visits
  for insert to anon with check (true);
create policy secret_shopper_visits_admin_select on public.secret_shopper_visits
  for select to authenticated using (public.is_admin());
create policy secret_shopper_visits_admin_update on public.secret_shopper_visits
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy secret_shopper_media_anon_insert on public.secret_shopper_media
  for insert to anon with check (true);
create policy secret_shopper_media_admin_select on public.secret_shopper_media
  for select to authenticated using (public.is_admin());

-- ─── Storage ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('secret-shopper-media', 'secret-shopper-media', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Uploads use server-issued signed upload URLs (no INSERT policy needed).
-- Only admins may read objects (for signed download URLs on the dashboard).
create policy secret_shopper_media_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'secret-shopper-media' and public.is_admin());

-- Trigger functions are not part of the API surface.
revoke execute on function public.secret_shopper_media_before_insert() from public, anon, authenticated;
revoke execute on function public.secret_shopper_visits_before_insert() from public, anon, authenticated;
revoke execute on function public.secret_shopper_visits_before_update() from public, anon, authenticated;
