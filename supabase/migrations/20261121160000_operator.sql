-- The operator (#159): the business that runs the fleet reads every house, server, job and buyer,
-- and changes none of them. An operator is a user whose app_metadata says
-- {"kachel_role": "operator"}. Only the service role can set app_metadata, so no one can make
-- themselves an operator from an app.

-- Who buys compute: a name and what they buy, one row per buyer account.
create table public.buyers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  buys text not null,
  synthetic boolean not null default true,
  created_at timestamptz not null default now()
);

comment on column public.buyers.buys is 'What the buyer runs on the fleet, e.g. game streaming or AI batch.';
comment on column public.buyers.synthetic is 'A made-up buyer from the seed, not a customer.';

alter table public.buyers enable row level security;

-- True when the signed-in user is an operator. Reads the token only, so it touches no table.
create function private.is_operator()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'kachel_role' = 'operator', false);
$$;

revoke all on function private.is_operator() from public;
grant execute on function private.is_operator() to authenticated;

create policy "Buyers read their own buyer row" on public.buyers
for select to authenticated
using (id = (select auth.uid()));

create policy "Operators read every buyer" on public.buyers
for select to authenticated
using ((select private.is_operator()));

create policy "Operators read every site" on public.sites
for select to authenticated
using ((select private.is_operator()));

create policy "Operators read every server" on public.servers
for select to authenticated
using ((select private.is_operator()));

create policy "Operators read every job" on public.jobs
for select to authenticated
using ((select private.is_operator()));

create policy "Operators read every job run" on public.job_runs
for select to authenticated
using ((select private.is_operator()));

create policy "Operators read the heat in every site" on public.heat_state
for select to authenticated
using ((select private.is_operator()));

create policy "Operators read every yearly balance" on public.kpis
for select to authenticated
using ((select private.is_operator()));
