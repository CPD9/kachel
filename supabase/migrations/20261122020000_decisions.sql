-- The live loop's decision log (services/scheduler/live.py), mirrored from out/decisions.jsonl.
-- One row per tick: what the scheduler saw, what it decided and which jobs ran, hashed onto the
-- entry before (heatsched/ledger.py). `entry` is the exact logged text, so `make verify-live --db`
-- can replay it through decide(). Rows are only ever added: no one, not even the service role,
-- may change or delete one.
create table public.decisions (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  prev_hash text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  seq bigint not null check (seq >= 0),
  site_id uuid not null references public.sites (id),
  time timestamptz not null,
  temp_c double precision,
  demand_kwh double precision not null,
  soc_kwh double precision not null,
  tank_kwh double precision not null,
  interactive smallint not null check (interactive >= 0),
  batch smallint not null check (batch >= 0),
  opportunistic smallint not null check (opportunistic >= 0),
  reason text not null,
  run jsonb not null,
  placed smallint not null default 0 check (placed >= 0),
  entry text not null,
  written_at timestamptz not null default now()
);

comment on column public.decisions.time is 'The clock time the decision is for (a replayed hour in the demo).';
comment on column public.decisions.run is 'The ids of the jobs the decision ran.';
comment on column public.decisions.entry is 'The log entry as hashed: canonical JSON with its inputs.';

create index decisions_site_written_idx on public.decisions (site_id, written_at desc);

create function public.decisions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'decisions is append-only: % is not allowed', tg_op;
end;
$$;

create trigger decisions_append_only
before update or delete on public.decisions
for each row execute function public.decisions_append_only();

alter table public.decisions enable row level security;

create policy "Hosts read the decisions for their sites" on public.decisions
for select to authenticated
using (site_id in (select private.hosted_site_ids()));

create policy "Operators read every decision" on public.decisions
for select to authenticated
using ((select private.is_operator()));

alter publication supabase_realtime add table public.decisions;
