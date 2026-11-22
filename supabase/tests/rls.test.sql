-- Each row level security policy (#7), against the seed plus a second host and buyer made here.
-- Run with `make check-db` (`pnpm exec supabase test db`) on a running local stack; the
-- Database CI job runs it on every push. Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

-- Seed: host 01 owns site 100 with servers 201-206; buyer 02 owns jobs 301-305
-- (301-304 on servers 201-204, 305 still queued). Here: host 03 with site 101 and server 211,
-- buyer 04 with job 311 on server 211.
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'host2@kachel.test'),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'buyer2@kachel.test');
insert into public.sites (id, host_id, name, city, tank_kwh, hot_water_kwh_per_day)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000003',
        'Other house', 'Bern', 30, 10);
insert into public.servers (id, site_id, slot, name, power_kw, heat_recovery, state)
values ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000101', 1,
        'Other server', 1.0, 0.8, 'RUNNING');
insert into public.jobs (id, buyer_id, site_id, server_id, kind, label, interruptible, state, pid)
values ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000211',
        'batch', 'Other buyer''s job', true, 'RUNNING', 5001);
insert into public.job_runs (job_id, server_id, tick, run, state)
values ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000211', 0, true, 'RUNNING');
insert into public.heat_state (site_id, time, demand_kwh)
values ('00000000-0000-4000-8000-000000000101', '2025-01-13 00:00:00+01', 8.0);
insert into public.kpis (site_id, profile_source, servers_per_house, heat_demand_kwh,
  share_of_heat_covered_pct, heat_dumped_kwh, backup_heat_kwh, utilisation_pct,
  server_hours_sold, missed_deadlines_pct_of_jobs, moved_offsite_pct_of_deadline_jobs,
  electricity_cost_chf, value_of_heat_used_chf, computing_income_chf,
  pays_off_at_assumed_compute_price)
values ('00000000-0000-4000-8000-000000000101', 'test', 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, true);

-- One logged decision for each house (#191): the live loop writes them with the service role.
insert into public.decisions (hash, prev_hash, seq, site_id, time, demand_kwh, soc_kwh, tank_kwh,
  interactive, batch, opportunistic, reason, run, entry)
values
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '0000000000000000000000000000000000000000000000000000000000000000', 0, '00000000-0000-4000-8000-000000000100', '2025-07-15 00:00:00+02', 0.5, 34.3, 35, 0, 0, 0,
   'tank full / no heat sink: backlog paused', '[]', '{}'),
  ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '0000000000000000000000000000000000000000000000000000000000000000', 0, '00000000-0000-4000-8000-000000000101', '2025-07-15 00:00:00+02', 0.5, 20, 30, 0, 0, 1,
   'heat needed', '[]', '{}');

-- Every table in public has row level security on.
select is(
  (select count(*) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity),
  0::bigint,
  'every public table has row level security'
);

-- Sign in as a user for the statements that follow, as PostgREST does with their token.
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------- host
select pg_temp.sign_in('00000000-0000-4000-8000-000000000001');
set local role authenticated;

select results_eq('select id::text from public.sites',
  array['00000000-0000-4000-8000-000000000100'], 'host reads their own site only');
select is((select count(*) from public.servers), 6::bigint, 'host reads the six servers in their site');
select is((select count(*) from public.servers where id = '00000000-0000-4000-8000-000000000211'),
  0::bigint, 'host cannot read another host''s server');
select set_eq('select id::text from public.jobs',
  array['00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000302',
        '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000304'],
  'host reads the jobs on their servers, not queued or other hosts'' jobs');
select is((select count(*) from public.job_runs), 3::bigint, 'host reads the runs on their servers');
select is((select count(*) from public.heat_state), 48::bigint, 'host reads their own heat state');
select is((select count(*) from public.heat_state where site_id = '00000000-0000-4000-8000-000000000101'),
  0::bigint, 'host cannot read another site''s heat state');
select is((select count(*) from public.kpis), 1::bigint, 'host reads their own yearly balance only');
select is((select count(*) from public.buyers), 0::bigint, 'host reads no buyers');
select is((select count(*) from public.decisions where hash in ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), 1::bigint,
  'host reads the decisions for their own house only');

update public.sites set name = 'Renamed by host' where id = '00000000-0000-4000-8000-000000000100';
update public.sites set name = 'Hijacked' where id = '00000000-0000-4000-8000-000000000101';
update public.servers set state = 'OFF' where id = '00000000-0000-4000-8000-000000000201';
update public.jobs set state = 'GONE' where id = '00000000-0000-4000-8000-000000000301';
select throws_ok(
  $$update public.sites set host_id = '00000000-0000-4000-8000-000000000003'
    where id = '00000000-0000-4000-8000-000000000100'$$,
  '42501', null, 'host cannot hand their site to someone else');
select throws_ok(
  $$insert into public.sites (host_id, name, city, tank_kwh, hot_water_kwh_per_day)
    values ('00000000-0000-4000-8000-000000000001', 'New', 'Basel', 1, 1)$$,
  '42501', null, 'host cannot add a site (the agent does)');
select throws_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible)
    values ('00000000-0000-4000-8000-000000000002', 'batch', 'x', true)$$,
  '42501', null, 'host cannot insert a job as another buyer');
select throws_ok(
  $$insert into public.heat_state (site_id, time, demand_kwh)
    values ('00000000-0000-4000-8000-000000000100', now(), 1)$$,
  '42501', null, 'host cannot write heat state');

reset role;
select is((select name from public.sites where id = '00000000-0000-4000-8000-000000000100'),
  'Renamed by host', 'host renamed their own site');
select is((select name from public.sites where id = '00000000-0000-4000-8000-000000000101'),
  'Other house', 'host could not rename another host''s site');
select is((select state::text from public.servers where id = '00000000-0000-4000-8000-000000000201'),
  'RUNNING', 'host could not change a server''s state');
select is((select state::text from public.jobs where id = '00000000-0000-4000-8000-000000000301'),
  'RUNNING', 'host could not change a job');

-- ---------------------------------------------------------------- buyer
select pg_temp.sign_in('00000000-0000-4000-8000-000000000002');
set local role authenticated;

-- Five on the reference house and two on fleet houses (#159).
select is((select count(*) from public.jobs), 7::bigint, 'buyer reads their own seven jobs');
select is((select count(*) from public.jobs where id = '00000000-0000-4000-8000-000000000311'),
  0::bigint, 'buyer cannot read another buyer''s job');
select is((select count(*) from public.job_runs), 3::bigint, 'buyer reads the runs of their jobs');
select is((select count(*) from public.decisions where hash in ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), 0::bigint,
  'buyer reads no house''s decisions');
select set_eq('select id::text from public.sites',
  array['00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000001003',
        '00000000-0000-4000-8000-000000001009'],
  'buyer reads the houses their jobs ran in only');
select set_eq('select id::text from public.servers',
  array['00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000204',
        '00000000-0000-4000-8000-000000020301', '00000000-0000-4000-8000-000000020901'],
  'buyer reads only the servers their jobs ran on');
select results_eq('select id::text from public.buyers',
  array['00000000-0000-4000-8000-000000000002'], 'buyer reads their own buyer row only');
select is((select count(*) from public.heat_state), 0::bigint, 'buyer cannot read heat state');
select is((select count(*) from public.kpis), 0::bigint, 'buyer cannot read a site''s balance');

select lives_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible, server_hours, deadline_at)
    values ('00000000-0000-4000-8000-000000000002', 'batch', 'Submitted in a test', true, 2,
            now() + interval '1 day')$$,
  'buyer submits a queued job of their own');
select is((select count(*) from public.jobs where label = 'Submitted in a test'), 1::bigint,
  'buyer reads the job they submitted');
select throws_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible)
    values ('00000000-0000-4000-8000-000000000004', 'batch', 'x', true)$$,
  '42501', null, 'buyer cannot submit a job for another buyer');
select throws_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible, state, server_id, site_id, pid)
    values ('00000000-0000-4000-8000-000000000002', 'batch', 'x', true, 'RUNNING',
            '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000100', 1)$$,
  '42501', null, 'buyer cannot place a job on a server or start it');
select throws_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible, server_id)
    values ('00000000-0000-4000-8000-000000000002', 'batch', 'x', true,
            '00000000-0000-4000-8000-000000000201')$$,
  '42501', null, 'buyer cannot pick a server for a queued job');
select throws_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible, items_done, active_cpu_s)
    values ('00000000-0000-4000-8000-000000000002', 'batch', 'x', true, 1000, 60)$$,
  '42501', null, 'buyer cannot send progress for a new job (the agent does)');
select throws_ok(
  $$insert into public.job_runs (job_id, tick, run, state)
    values ('00000000-0000-4000-8000-000000000301', 1, true, 'RUNNING')$$,
  '42501', null, 'buyer cannot write job runs');

update public.jobs set state = 'GONE' where id = '00000000-0000-4000-8000-000000000301';
update public.jobs set label = 'Taken' where id = '00000000-0000-4000-8000-000000000311';
delete from public.jobs where id = '00000000-0000-4000-8000-000000000302';
update public.sites set name = 'Renamed by buyer' where id = '00000000-0000-4000-8000-000000000100';

reset role;
select is((select state::text from public.jobs where id = '00000000-0000-4000-8000-000000000301'),
  'RUNNING', 'buyer could not change the state of their job (the agent does)');
select is((select label from public.jobs where id = '00000000-0000-4000-8000-000000000311'),
  'Other buyer''s job', 'buyer could not change another buyer''s job');
select is((select count(*) from public.jobs where id = '00000000-0000-4000-8000-000000000302'),
  1::bigint, 'buyer could not delete a job');
select is((select name from public.sites where id = '00000000-0000-4000-8000-000000000100'),
  'Renamed by host', 'buyer could not rename the house');

-- ---------------------------------------------------------------- second host
select pg_temp.sign_in('00000000-0000-4000-8000-000000000003');
set local role authenticated;
select results_eq('select id::text from public.jobs',
  array['00000000-0000-4000-8000-000000000311'], 'the second host reads only the job on their server');
select is((select count(*) from public.sites where id = '00000000-0000-4000-8000-000000000100'),
  0::bigint, 'the second host cannot read the first host''s site');
select results_eq($$select hash from public.decisions where hash in ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')$$,
  array['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'], 'the second host reads only their own house''s decision');
reset role;

-- ---------------------------------------------------------------- operator
-- The seed's operator (#159): app_metadata says kachel_role operator, as in their token.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000009', 'role', 'authenticated',
                    'app_metadata', json_build_object('kachel_role', 'operator'))::text, true);
set local role authenticated;
select is((select count(*) from public.sites), 14::bigint, 'operator reads every site');
-- 6 in the reference house, 60 in the twelve fleet houses, and server 211.
select is((select count(*) from public.servers), 67::bigint, 'operator reads every server');
-- 25 from the seed, job 311 and the one the buyer submitted above.
select is((select count(*) from public.jobs), 27::bigint, 'operator reads every buyer''s jobs');
select is((select count(distinct buyer_id) from public.jobs), 8::bigint,
  'operator sees the jobs of all eight buyers');
select is((select count(*) from public.buyers), 7::bigint, 'operator reads every buyer');
select is((select count(*) from public.heat_state), 49::bigint, 'operator reads the heat in every site');
select is((select count(*) from public.kpis), 2::bigint, 'operator reads every yearly balance');
select is((select count(*) from public.job_runs), 4::bigint, 'operator reads every job run');
select is((select count(*) from public.decisions where hash in ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), 2::bigint,
  'operator reads every decision');
update public.sites set name = 'Renamed by operator' where id = '00000000-0000-4000-8000-000000000101';
update public.jobs set state = 'GONE' where id = '00000000-0000-4000-8000-000000000311';
select throws_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible)
    values ('00000000-0000-4000-8000-000000000002', 'batch', 'x', true)$$,
  '42501', null, 'operator cannot submit a job for a buyer');
select throws_ok(
  $$insert into public.buyers (id, name, buys) values ('00000000-0000-4000-8000-000000000009', 'x', 'x')$$,
  '42501', null, 'operator cannot add a buyer');
reset role;
select is((select name from public.sites where id = '00000000-0000-4000-8000-000000000101'),
  'Other house', 'operator could not rename a site');
select is((select state::text from public.jobs where id = '00000000-0000-4000-8000-000000000311'),
  'RUNNING', 'operator could not change a job');

-- A host with kachel_role in user_metadata, which anyone can set, is not an operator.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000001', 'role', 'authenticated',
                    'user_metadata', json_build_object('kachel_role', 'operator'))::text, true);
set local role authenticated;
select is((select count(*) from public.sites), 1::bigint, 'user_metadata does not make an operator');
reset role;

-- ---------------------------------------------------------------- anon
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is((select count(*) from public.sites), 0::bigint, 'anon reads no sites');
select is((select count(*) from public.servers), 0::bigint, 'anon reads no servers');
select is((select count(*) from public.jobs), 0::bigint, 'anon reads no jobs');
select is((select count(*) from public.heat_state), 0::bigint, 'anon reads no heat state');
select is((select count(*) from public.buyers), 0::bigint, 'anon reads no buyers');
select is((select count(*) from public.decisions), 0::bigint, 'anon reads no decisions');
select ok((select count(*) from public.assumptions) > 0, 'anon reads the public assumptions');
select throws_ok(
  $$insert into public.jobs (buyer_id, kind, label, interruptible)
    values ('00000000-0000-4000-8000-000000000002', 'batch', 'x', true)$$,
  '42501', null, 'anon cannot submit a job');
reset role;

-- ---------------------------------------------------------------- agent (service role)
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
set local role service_role;
-- 14: the seed's reference house and its twelve synthetic fleet houses (#81), and site 101.
select is((select count(*) from public.sites), 14::bigint, 'the agent reads every site');
select lives_ok(
  $$update public.servers set state = 'OFF' where id = '00000000-0000-4000-8000-000000000211'$$,
  'the agent writes a server''s state');
select lives_ok(
  $$insert into public.decisions (hash, prev_hash, seq, site_id, time, demand_kwh, soc_kwh, tank_kwh,
      interactive, batch, opportunistic, reason, run, entry)
    values ('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1, '00000000-0000-4000-8000-000000000100', '2025-07-15 01:00:00+02',
      0.5, 34.6, 35, 0, 0, 1, 'heat needed', '[]', '{}')$$,
  'the live loop adds a decision');
select throws_ok(
  $$update public.decisions set reason = 'rewritten' where hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'$$,
  'P0001', null, 'not even the service role can change a logged decision');
select throws_ok(
  $$delete from public.decisions where hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'$$,
  'P0001', null, 'not even the service role can delete a logged decision');
reset role;

select * from finish();
rollback;
