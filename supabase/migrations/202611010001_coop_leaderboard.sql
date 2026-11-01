-- Two-player co-op runs rank separately from solo runs. Both players' names
-- are stored with the shared team score; writes go through the Edge Function.
alter table public.game_runs
  add column if not exists mode text not null default 'solo' check (mode in ('solo', 'coop'));

create table if not exists public.coop_leaderboard (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name1 text not null check (char_length(name1) between 1 and 18),
  name2 text not null check (char_length(name2) between 1 and 18),
  score integer not null check (score > 0),
  wave integer not null default 0 check (wave >= 0)
);

alter table public.coop_leaderboard enable row level security;

create policy "Co-op leaderboard is publicly readable"
  on public.coop_leaderboard for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.coop_leaderboard from anon, authenticated;
grant select on public.coop_leaderboard to anon, authenticated;
grant select, insert, update, delete on public.coop_leaderboard to service_role;
