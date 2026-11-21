-- Row level security (#3): every table is closed unless a policy below opens it.
-- A host reads their own site, its servers, the jobs on those servers, its heat and its
-- yearly balance, and may rename or retune their site. A buyer reads and submits their own
-- jobs, reads the runs of those jobs and the house each one ran in. The agent writes
-- everything with the service role key, which bypasses row level security; that key is read
-- from services/agent/.env and never reaches an app. The model's assumptions and
-- measurements are public. The tests are in supabase/tests/rls.test.sql (#7).

alter table public.sites enable row level security;
alter table public.servers enable row level security;
alter table public.jobs enable row level security;
alter table public.job_runs enable row level security;
alter table public.heat_state enable row level security;
alter table public.kpis enable row level security;
alter table public.measurements enable row level security;
alter table public.assumptions enable row level security;

-- The helpers run as their owner (who owns the tables, so row level security does not apply
-- inside them). Policies that ask "is this my site?" through them cannot loop back into each
-- other. The schema is not exposed over the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- The sites the signed-in user hosts.
create function private.hosted_site_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.sites s where s.host_id = (select auth.uid());
$$;

-- The servers in those sites.
create function private.hosted_server_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id
  from public.servers v
  join public.sites s on s.id = v.site_id
  where s.host_id = (select auth.uid());
$$;

-- The sites the signed-in buyer's jobs were placed in.
create function private.bought_site_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct j.site_id
  from public.jobs j
  where j.buyer_id = (select auth.uid()) and j.site_id is not null;
$$;

revoke all on function private.hosted_site_ids() from public;
revoke all on function private.hosted_server_ids() from public;
revoke all on function private.bought_site_ids() from public;
grant execute on function private.hosted_site_ids() to authenticated;
grant execute on function private.hosted_server_ids() to authenticated;
grant execute on function private.bought_site_ids() to authenticated;

-- sites
create policy "Hosts read their own sites" on public.sites
for select to authenticated
using (host_id = (select auth.uid()));

create policy "Buyers read the houses their jobs ran in" on public.sites
for select to authenticated
using (id in (select private.bought_site_ids()));

create policy "Hosts update their own sites" on public.sites
for update to authenticated
using (host_id = (select auth.uid()))
with check (host_id = (select auth.uid()));

-- servers: the agent sets their state; hosts only read.
create policy "Hosts read the servers in their sites" on public.servers
for select to authenticated
using (site_id in (select private.hosted_site_ids()));

-- jobs
create policy "Buyers read their own jobs" on public.jobs
for select to authenticated
using (buyer_id = (select auth.uid()));

create policy "Hosts read the jobs on their servers" on public.jobs
for select to authenticated
using (server_id in (select private.hosted_server_ids()));

-- A new job waits in the queue; only the agent places it on a server and starts it.
create policy "Buyers submit their own queued jobs" on public.jobs
for insert to authenticated
with check (
  buyer_id = (select auth.uid())
  and state = 'QUEUED'
  and site_id is null
  and server_id is null
  and pid is null
  and items_done = 0
  and active_cpu_s = 0
);

-- job_runs: whoever may read the job may read its runs.
create policy "Buyers and hosts read the runs of jobs they can see" on public.job_runs
for select to authenticated
using (
  job_id in (select j.id from public.jobs j where j.buyer_id = (select auth.uid()))
  or server_id in (select private.hosted_server_ids())
);

-- heat_state and kpis: the host's own house.
create policy "Hosts read the heat in their sites" on public.heat_state
for select to authenticated
using (site_id in (select private.hosted_site_ids()));

create policy "Hosts read the yearly balance of their sites" on public.kpis
for select to authenticated
using (site_id in (select private.hosted_site_ids()));

-- The model's inputs are public, so anyone can check a number against its source.
create policy "Everyone reads the assumptions" on public.assumptions
for select to anon, authenticated
using (true);

create policy "Everyone reads the measurements" on public.measurements
for select to anon, authenticated
using (true);
