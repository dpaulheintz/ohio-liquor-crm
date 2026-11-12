-- Barrel Arcade (/play): weekly leaderboards replace the $2-off reward.
--
-- Each game has its own board. Kids enter 3 initials, nothing else. Boards run Monday through Sunday
-- (America/New_York) and start empty every Monday: reads only ever look at the current week, and a
-- daily Vercel cron (/api/cron/arcade-purge) deletes older rows.
--
-- Access: RLS is on and there are no policies, so anon / authenticated can neither read nor write the
-- tables. Scores are written only by the /api/arcade/score route (service role, via
-- arcade_submit_score). The public reads the current week's top 10 through arcade_leaderboards().

-- ─── Week helper ──────────────────────────────────────────────────────────────

-- Monday of the week containing p_at, in Eastern time (DST handled by the tz database).
create or replace function public.arcade_week_start(p_at timestamptz default now())
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('week', p_at at time zone 'America/New_York')::date;
$$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- The only data kept: which board, 3 initials, the score, the week, when. No IP, device or name.
create table public.arcade_scores (
  id bigint generated always as identity primary key,
  game text not null check (game in (
    'rush', 'stack', 'jump', 'fork', 'pack', 'cross', 'slice', 'paint-easy', 'paint-medium', 'paint-hard')),
  initials text not null check (initials ~ '^[A-Z]{3}$'),
  score integer not null check (score >= 0 and score <= 10000000),
  week_start date not null default public.arcade_week_start(),
  created_at timestamptz not null default now()
);
create index arcade_scores_board_idx on public.arcade_scores (week_start, game, score desc, created_at);

-- Initials an admin blocked from the CRM, on top of the built-in list in src/lib/arcade/blocklist.ts.
create table public.arcade_blocked_initials (
  initials text primary key check (initials ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

-- Rate limiting for /api/arcade/score: a keyed hash that rotates daily (never a raw IP). Rows older
-- than the 10-minute window are deleted on every submit and by the daily purge.
create table public.arcade_rate_events (
  id bigint generated always as identity primary key,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index arcade_rate_events_lookup_idx on public.arcade_rate_events (key_hash, created_at desc);
create index arcade_rate_events_created_idx on public.arcade_rate_events (created_at);

alter table public.arcade_scores enable row level security;
alter table public.arcade_blocked_initials enable row level security;
alter table public.arcade_rate_events enable row level security;
revoke all on public.arcade_scores from anon, authenticated;
revoke all on public.arcade_blocked_initials from anon, authenticated;
revoke all on public.arcade_rate_events from anon, authenticated;

-- ─── Ranking ──────────────────────────────────────────────────────────────────

-- Paint by Numbers boards rank by fastest finish (lowest seconds); everything else by highest score.
-- Ties go to whoever got there first.
create or replace function public.arcade_ranked(p_week date)
returns table (id bigint, game text, initials text, score integer, created_at timestamptz, rank bigint)
language sql
stable
set search_path = public
as $$
  select s.id, s.game, s.initials, s.score, s.created_at,
    row_number() over (
      partition by s.game
      order by case when s.game like 'paint-%' then s.score else -s.score end, s.created_at, s.id) as rank
  from public.arcade_scores s
  where s.week_start = p_week;
$$;
revoke execute on function public.arcade_ranked(date) from public, anon, authenticated;

-- ─── Public read ──────────────────────────────────────────────────────────────

-- This week's top 10 for every board: { week_start, resets_at, boards: { game: [[initials, score], ...] } }
create or replace function public.arcade_leaderboards()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with wk as (select public.arcade_week_start() as d),
  top as (select r.* from wk, public.arcade_ranked(wk.d) r where r.rank <= 10)
  select jsonb_build_object(
    'week_start', (select d from wk),
    'resets_at', (((select d from wk) + 7)::timestamp at time zone 'America/New_York'),
    'boards', coalesce((
      select jsonb_object_agg(game, entries)
      from (
        select game, jsonb_agg(jsonb_build_array(initials, score) order by rank) as entries
        from top group by game
      ) b
    ), '{}'::jsonb)
  );
$$;
revoke execute on function public.arcade_leaderboards() from public;
grant execute on function public.arcade_leaderboards() to anon, authenticated, service_role;

-- ─── Submit (service role only; called by /api/arcade/score after it validates the run) ───────

-- Inserts the score only if it makes this week's top 10 for that board. Returns
-- { ok: true, rank } or { ok: false, reason: 'blocked' | 'not_top10' }.
create or replace function public.arcade_submit_score(p_game text, p_initials text, p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := public.arcade_week_start();
  v_asc boolean := p_game like 'paint-%';
  v_count int;
  v_cut int;
  v_id bigint;
  v_rank bigint;
begin
  if exists (select 1 from public.arcade_blocked_initials where initials = p_initials) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;

  select count(*), (array_agg(score order by rank desc))[1]
    into v_count, v_cut
    from public.arcade_ranked(v_week) r
   where r.game = p_game and r.rank <= 10;
  -- A full board needs a strictly better score than 10th place (ties keep the earlier entry).
  if v_count >= 10 and ((v_asc and p_score >= v_cut) or (not v_asc and p_score <= v_cut)) then
    return jsonb_build_object('ok', false, 'reason', 'not_top10');
  end if;
  if not v_asc and p_score <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_top10');
  end if;

  insert into public.arcade_scores (game, initials, score, week_start)
  values (p_game, p_initials, p_score, v_week)
  returning id into v_id;

  select r.rank into v_rank from public.arcade_ranked(v_week) r where r.id = v_id;
  return jsonb_build_object('ok', true, 'rank', v_rank);
end $$;
revoke execute on function public.arcade_submit_score(text, text, integer) from public, anon, authenticated;
grant execute on function public.arcade_submit_score(text, text, integer) to service_role;

-- ─── Weekly reset (daily cron) ────────────────────────────────────────────────

-- Deletes every score from before this Monday (Eastern) and rate events past their 10-minute window.
create or replace function public.arcade_purge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scores int;
  v_rate int;
begin
  delete from public.arcade_scores where week_start < public.arcade_week_start();
  get diagnostics v_scores = row_count;
  delete from public.arcade_rate_events where created_at < now() - interval '10 minutes';
  get diagnostics v_rate = row_count;
  return jsonb_build_object('scores_deleted', v_scores, 'rate_events_deleted', v_rate, 'week_start', public.arcade_week_start());
end $$;
revoke execute on function public.arcade_purge() from public, anon, authenticated;
grant execute on function public.arcade_purge() to service_role;

revoke execute on function public.arcade_week_start(timestamptz) from public, anon, authenticated;
grant execute on function public.arcade_week_start(timestamptz) to service_role;
