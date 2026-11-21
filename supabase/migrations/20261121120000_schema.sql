-- The Kachel schema: houses, their servers, the jobs on them and the heat they make.
-- Column names follow what services/agent and services/scheduler already produce, so their
-- output can be written as it is. Row level security is #3 and Realtime is #6; neither is here.

-- The agent's job states (services/agent/src/kachel_agent/process.py: State).
-- QUEUED is a job that has not reached a server yet.
create type public.job_state as enum ('QUEUED', 'RUNNING', 'PAUSED', 'GONE');

-- The scheduler's three kinds of work (services/scheduler/config.json: jobs).
create type public.job_kind as enum ('interactive', 'batch', 'opportunistic');

-- A server runs a job, holds a paused one, or is off because its heat is not needed.
create type public.server_state as enum ('RUNNING', 'PAUSED', 'OFF');

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A house with a hot-water tank (config.json: house).
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  city text not null,
  latitude double precision,
  longitude double precision,
  tank_kwh double precision not null check (tank_kwh > 0),
  hot_water_kwh_per_day double precision not null check (hot_water_kwh_per_day >= 0),
  hot_water_shape text not null default 'flat',
  created_at timestamptz not null default now()
);

create index sites_host_id_idx on public.sites (host_id);

-- One server box in the basement (config.json: server).
create table public.servers (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slot smallint not null check (slot >= 1),
  name text not null,
  power_kw double precision not null check (power_kw > 0),
  heat_recovery double precision not null check (heat_recovery between 0 and 1),
  idle_power_kw double precision not null default 0 check (idle_power_kw >= 0),
  state public.server_state not null default 'OFF',
  updated_at timestamptz not null default now(),
  unique (site_id, slot)
);

create trigger servers_touch_updated_at
before update on public.servers
for each row execute function public.touch_updated_at();

-- A buyer's job. The agent addresses the real process by PID only; progress mirrors the
-- embedding job's checkpoint (services/scheduler/jobs/embed_job.py).
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  server_id uuid references public.servers (id) on delete set null,
  kind public.job_kind not null,
  label text not null,
  interruptible boolean not null,
  server_hours double precision check (server_hours > 0),
  deadline_at timestamptz,
  state public.job_state not null default 'QUEUED',
  pid integer check (pid > 0),
  workload text,
  items_done bigint not null default 0 check (items_done >= 0),
  items_total bigint check (items_total > 0),
  active_cpu_s double precision not null default 0 check (active_cpu_s >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A job that runs or is paused is on a server, so the house view can place it.
  constraint jobs_live_on_a_server check (state not in ('RUNNING', 'PAUSED') or server_id is not null)
);

create index jobs_buyer_id_idx on public.jobs (buyer_id);
create index jobs_site_id_idx on public.jobs (site_id);
create index jobs_server_id_idx on public.jobs (server_id);

create trigger jobs_touch_updated_at
before update on public.jobs
for each row execute function public.touch_updated_at();

-- Each change the agent reports (services/agent/src/kachel_agent/loop.py: Change):
-- the tick, the heat signal it followed and the job's state after.
create table public.job_runs (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  server_id uuid references public.servers (id) on delete set null,
  tick integer not null check (tick >= 0),
  run boolean not null,
  state public.job_state not null,
  items_done bigint check (items_done >= 0),
  reason text,
  at timestamptz not null default now()
);

create index job_runs_job_id_at_idx on public.job_runs (job_id, at);
create index job_runs_server_id_idx on public.job_runs (server_id);

-- One row per site and hour, as the scheduler's house model writes it
-- (services/scheduler/heatsched/sim.py: House.apply; out/day_*.csv). Energies in kWh;
-- interactive, batch and opportunistic are servers given to each kind that hour.
create table public.heat_state (
  site_id uuid not null references public.sites (id) on delete cascade,
  time timestamptz not null,
  temp_c double precision,
  demand_kwh double precision not null check (demand_kwh >= 0),
  interactive smallint not null default 0 check (interactive >= 0),
  batch smallint not null default 0 check (batch >= 0),
  opportunistic smallint not null default 0 check (opportunistic >= 0),
  server_hours double precision not null default 0 check (server_hours >= 0),
  heat_produced double precision not null default 0 check (heat_produced >= 0),
  heat_used double precision not null default 0 check (heat_used >= 0),
  served_kwh double precision not null default 0 check (served_kwh >= 0),
  backup_kwh double precision not null default 0 check (backup_kwh >= 0),
  dumped_kwh double precision not null default 0 check (dumped_kwh >= 0),
  soc_kwh double precision not null default 0 check (soc_kwh >= 0),
  reserve_kwh double precision not null default 0 check (reserve_kwh >= 0),
  arr_interactive double precision not null default 0,
  arr_batch double precision not null default 0,
  moved double precision not null default 0,
  missed double precision not null default 0,
  reason text,
  primary key (site_id, time)
);

comment on column public.heat_state.soc_kwh is 'Heat in the tank at the end of the hour.';

-- The yearly balance for a site (services/scheduler/out/kpis.json).
create table public.kpis (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  profile_source text not null,
  servers_per_house integer not null check (servers_per_house >= 1),
  heat_demand_kwh double precision not null,
  share_of_heat_covered_pct double precision not null,
  heat_dumped_kwh double precision not null,
  backup_heat_kwh double precision not null,
  utilisation_pct double precision not null,
  server_hours_sold double precision not null,
  missed_deadlines_pct_of_jobs double precision not null,
  moved_offsite_pct_of_deadline_jobs double precision not null,
  electricity_cost_chf double precision not null,
  value_of_heat_used_chf double precision not null,
  computing_income_chf double precision not null,
  break_even_chf_per_server_hour double precision,
  pays_off_at_assumed_compute_price boolean not null,
  heating_days integer,
  does_not_pay_off_when text,
  computed_at timestamptz not null default now()
);

create index kpis_site_id_idx on public.kpis (site_id, computed_at);

-- A measured run of the real job, scaled to the reference server
-- (services/scheduler/measure.py: out/measurements.json).
create table public.measurements (
  id bigint generated always as identity primary key,
  server_id uuid references public.servers (id) on delete set null,
  workload text not null,
  items_measured bigint not null check (items_measured >= 0),
  active_cpu_s double precision not null check (active_cpu_s >= 0),
  items_per_s_on_this_device double precision not null,
  device_watts_assumed double precision not null check (device_watts_assumed > 0),
  items_per_job integer not null check (items_per_job > 0),
  runtime_per_job_s_on_this_device double precision not null,
  energy_per_job_wh double precision not null,
  jobs_per_reference_server_hour double precision not null,
  runtime_per_job_s_on_reference_server double precision not null,
  scaling_rule text not null,
  measured_at timestamptz not null default now()
);

create index measurements_server_id_idx on public.measurements (server_id);

-- Every number the model uses, with where it comes from (services/scheduler/config.json).
create table public.assumptions (
  section text not null,
  key text not null,
  value jsonb not null,
  source text not null,
  primary key (section, key)
);
