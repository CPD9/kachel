-- Synthetic seed for the local stack: the Basel reference house, its six servers, one host,
-- one buyer and a few jobs. Every value is made up or comes from services/scheduler
-- (config.json, out/kpis.json, out/day_january.csv and out/day_july.csv); no real person or
-- house is described. Both accounts sign in locally with the password kachel-demo.
-- Rebuild with `make db-reset`.

-- Accounts
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'host@kachel.test',
   extensions.crypt('kachel-demo', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"name": "Demo host"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'buyer@kachel.test',
   extensions.crypt('kachel-demo', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"name": "Demo buyer"}', now(), now(), '', '', '', '');

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
   '{"sub": "00000000-0000-4000-8000-000000000001", "email": "host@kachel.test", "email_verified": true}', 'email', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   '{"sub": "00000000-0000-4000-8000-000000000002", "email": "buyer@kachel.test", "email_verified": true}', 'email', now(), now(), now());

-- The reference house (config.json: house); coordinates from the weather profile.
insert into public.sites (
  id, host_id, name, city, latitude, longitude, tank_kwh, hot_water_kwh_per_day, hot_water_shape
)
values ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000001', 'Reference house', 'Basel', 47.56, 7.59,
        35.0, 12.0, 'flat');

-- Six servers (out/kpis.json: servers_per_house), each as config.json: server.
insert into public.servers (id, site_id, slot, name, power_kw, heat_recovery, idle_power_kw, state)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000100', 1, 'Server 1', 1.0, 0.8, 0.0, 'RUNNING'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000100', 2, 'Server 2', 1.0, 0.8, 0.0, 'RUNNING'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000100', 3, 'Server 3', 1.0, 0.8, 0.0, 'RUNNING'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000100', 4, 'Server 4', 1.0, 0.8, 0.0, 'PAUSED'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000100', 5, 'Server 5', 1.0, 0.8, 0.0, 'OFF'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000100', 6, 'Server 6', 1.0, 0.8, 0.0, 'OFF');

-- A few jobs for the buyer, one of each kind (config.json: jobs). PIDs are made up.
insert into public.jobs (
  id, buyer_id, site_id, server_id, kind, label, interruptible, server_hours, deadline_at,
  state, pid, workload, items_done, items_total, active_cpu_s
)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000201', 'opportunistic', 'Embeddings backlog, part 1',
   true, null, null, 'RUNNING', 4101, 'numpy hashing-embedding (fallback, not a neural model)', 51200, 200000, 412.5),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000202', 'opportunistic', 'Embeddings backlog, part 2',
   true, null, null, 'RUNNING', 4102, 'numpy hashing-embedding (fallback, not a neural model)', 12800, 200000, 103.1),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000203', 'batch', 'Transcription batch',
   true, 8.0, now() + interval '20 hours', 'RUNNING', 4103, null, 0, null, 0.0),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000204', 'opportunistic', 'Embeddings backlog, part 3',
   true, null, null, 'PAUSED', 4104, 'numpy hashing-embedding (fallback, not a neural model)', 30720, 200000, 247.6),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000100', null, 'interactive', 'Evening chat session',
   false, 4.0, null, 'QUEUED', null, null, 0, null, 0.0);

-- What the agent reported, each change on its signal file: both jobs running, then one paused.
-- On stage that file is flipped by hand, so the reasons say so; they are not tank readings (the
-- January day below has the tank empty and heat needed).
-- The agent ticks once a second (--tick 1.0), so tick 7200 is two hours after tick 0.
insert into public.job_runs (job_id, server_id, tick, run, state, items_done, reason, at)
values
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000204', 0, true, 'RUNNING', 0, 'running on its signal file (demo switch)', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000204', 7200, false, 'PAUSED', 30720, 'paused by its signal file (demo switch, not the tank)', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 0, true, 'RUNNING', 0, 'running on its signal file (demo switch)', now() - interval '3 hours');

-- The January day from the scheduler's yearly run (out/day_january.csv), local time.
insert into public.heat_state (site_id, time, temp_c, demand_kwh, interactive, batch, opportunistic, server_hours, heat_produced, heat_used, served_kwh, backup_kwh, dumped_kwh, soc_kwh, reserve_kwh, arr_interactive, arr_batch, moved, missed, reason)
values
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 00:00:00+01', -3.8, 9.7969, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.9969, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 01:00:00+01', -3.7, 9.7578, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.9578, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 02:00:00+01', -3.4, 9.6406, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.8406, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 03:00:00+01', -3.5, 9.6797, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.8797, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 04:00:00+01', -3.5, 9.6797, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.8797, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 05:00:00+01', -3.6, 9.7188, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.9187, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 06:00:00+01', -3.9, 9.8359, 0, 6, 0, 6.0, 4.8, 4.8, 4.8, 5.0359, 0.0, 0.0, 0.0, 0.0, 8.0, 0.0, 0.0, 'no free server'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 07:00:00+01', -4.2, 9.9531, 0, 2, 4, 6.0, 4.8, 4.8, 4.8, 5.1531, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 08:00:00+01', -4.0, 9.875, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 5.075, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 09:00:00+01', -3.1, 9.5234, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.7234, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 10:00:00+01', -2.2, 9.1719, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.3719, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 11:00:00+01', -1.4, 8.8594, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.0594, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 12:00:00+01', -0.4, 8.4688, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 3.6687, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 13:00:00+01', 0.7, 8.0391, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 3.2391, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 14:00:00+01', 2.0, 7.5312, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 2.7312, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 15:00:00+01', 2.3, 7.4141, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 2.6141, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 16:00:00+01', 1.1, 7.8828, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 3.0828, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 17:00:00+01', -1.4, 8.8594, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.0594, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 18:00:00+01', -2.4, 9.25, 1, 0, 5, 6.0, 4.8, 4.8, 4.8, 4.45, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 19:00:00+01', -3.0, 9.4844, 1, 0, 5, 6.0, 4.8, 4.8, 4.8, 4.6844, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 20:00:00+01', -3.7, 9.7578, 1, 0, 5, 6.0, 4.8, 4.8, 4.8, 4.9578, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 21:00:00+01', -3.7, 9.7578, 1, 0, 5, 6.0, 4.8, 4.8, 4.8, 4.9578, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 22:00:00+01', -3.7, 9.7578, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 4.9578, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-01-13 23:00:00+01', -3.9, 9.8359, 0, 0, 6, 6.0, 4.8, 4.8, 4.8, 5.0359, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed');

-- The July day from the scheduler's yearly run (out/day_july.csv), local time.
insert into public.heat_state (site_id, time, temp_c, demand_kwh, interactive, batch, opportunistic, server_hours, heat_produced, heat_used, served_kwh, backup_kwh, dumped_kwh, soc_kwh, reserve_kwh, arr_interactive, arr_batch, moved, missed, reason)
values
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 00:00:00+02', 19.5, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.3, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 01:00:00+02', 19.8, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.6, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 02:00:00+02', 18.0, 0.5, 0, 0, 1, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.9, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 03:00:00+02', 18.2, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.4, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 04:00:00+02', 18.1, 0.5, 0, 0, 1, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.7, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 05:00:00+02', 17.5, 0.5, 0, 0, 1, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 35.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'heat needed'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 06:00:00+02', 18.1, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.5, 0.0, 0.0, 8.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 07:00:00+02', 20.0, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.8, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 08:00:00+02', 20.5, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.3, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 09:00:00+02', 21.4, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.6, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 10:00:00+02', 22.8, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.9, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 11:00:00+02', 23.3, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.4, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 12:00:00+02', 24.2, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.7, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 13:00:00+02', 25.1, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 35.0, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 14:00:00+02', 24.9, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.5, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 15:00:00+02', 24.6, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.8, 0.2, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 16:00:00+02', 24.5, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.3, 0.7, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 17:00:00+02', 23.9, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 33.8, 1.2, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 18:00:00+02', 23.4, 0.5, 1, 0, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.1, 0.9, 1.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 19:00:00+02', 22.8, 0.5, 1, 0, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.4, 0.6, 1.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 20:00:00+02', 21.5, 0.5, 1, 0, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.7, 0.3, 1.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 21:00:00+02', 20.1, 0.5, 1, 0, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 35.0, 0.0, 1.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 22:00:00+02', 19.4, 0.5, 0, 0, 0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 34.5, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused'),
  ('00000000-0000-4000-8000-000000000100', '2025-07-15 23:00:00+02', 18.3, 0.5, 0, 1, 0, 1.0, 0.8, 0.8, 0.5, 0.0, 0.0, 34.8, 0.0, 0.0, 0.0, 0.0, 0.0, 'tank full / no heat sink: backlog paused');

-- The yearly balance (out/kpis.json).
insert into public.kpis (site_id, servers_per_house, heat_demand_kwh, share_of_heat_covered_pct, heat_dumped_kwh, backup_heat_kwh, utilisation_pct, server_hours_sold, missed_deadlines_pct_of_jobs, moved_offsite_pct_of_deadline_jobs, electricity_cost_chf, value_of_heat_used_chf, computing_income_chf, break_even_chf_per_server_hour, pays_off_at_assumed_compute_price, profile_source, heating_days, does_not_pay_off_when)
values ('00000000-0000-4000-8000-000000000100', 6, 31231, 79.6, 9.1, 6380, 59.1, 31075, 0.0, 0.0, 8608, 2753, 15538, 0.1884, true, 'Open-Meteo archive, Basel 2025', 206, 'compute earns less than CHF 0.19 per server-hour');

-- Every number the model uses, with its source (config.json).
insert into public.assumptions (section, key, value, source)
values
  ('house', 'tank_kwh', '35.0'::jsonb, 'DigitalHeat case brief (reference house). hot_water_shape=flat is OUR assumption; overridden when the case CSV is passed with --profile.'),
  ('house', 'hot_water_kwh_per_day', '12.0'::jsonb, 'DigitalHeat case brief (reference house). hot_water_shape=flat is OUR assumption; overridden when the case CSV is passed with --profile.'),
  ('house', 'hot_water_shape', '"flat"'::jsonb, 'DigitalHeat case brief (reference house). hot_water_shape=flat is OUR assumption; overridden when the case CSV is passed with --profile.'),
  ('server', 'power_kw', '1.0'::jsonb, 'Case brief. idle_power_kw=0 is OUR simplification: a paused server is assumed to draw nothing.'),
  ('server', 'heat_recovery', '0.8'::jsonb, 'Case brief. idle_power_kw=0 is OUR simplification: a paused server is assumed to draw nothing.'),
  ('server', 'idle_power_kw', '0.0'::jsonb, 'Case brief. idle_power_kw=0 is OUR simplification: a paused server is assumed to draw nothing.'),
  ('prices', 'electricity_chf_per_kwh', '0.277'::jsonb, 'electricity: PLACEHOLDER = ElCom 2026 Swiss H4 median (27.7 Rp). REPLACE with IWB Basel H4 total from strompreis.elcom.admin.ch. COP: case brief. compute price: OUR assumption, shown only against the break-even.'),
  ('prices', 'heat_pump_cop', '2.5'::jsonb, 'electricity: PLACEHOLDER = ElCom 2026 Swiss H4 median (27.7 Rp). REPLACE with IWB Basel H4 total from strompreis.elcom.admin.ch. COP: case brief. compute price: OUR assumption, shown only against the break-even.'),
  ('prices', 'compute_chf_per_server_hour', '0.5'::jsonb, 'electricity: PLACEHOLDER = ElCom 2026 Swiss H4 median (27.7 Rp). REPLACE with IWB Basel H4 total from strompreis.elcom.admin.ch. COP: case brief. compute price: OUR assumption, shown only against the break-even.'),
  ('model', 'forecast', '"persistence"'::jsonb, 'config.json: forecast'),
  ('jobs.interactive', 'label', '"Interactive sessions (local AI chat, game streaming)"'::jsonb, 'OUR scenario: one evening session block of 4 h per house and day.'),
  ('jobs.interactive', 'interruptible', 'false'::jsonb, 'OUR scenario: one evening session block of 4 h per house and day.'),
  ('jobs.interactive', 'deadline_h', '0'::jsonb, 'OUR scenario: one evening session block of 4 h per house and day.'),
  ('jobs.interactive', 'arrivals_server_h', '{"18": 1, "19": 1, "20": 1, "21": 1}'::jsonb, 'OUR scenario: one evening session block of 4 h per house and day.'),
  ('jobs.interactive', 'when_heat_not_needed', '"run_and_dump"'::jsonb, 'OUR scenario: one evening session block of 4 h per house and day.'),
  ('jobs.batch', 'label', '"Batch with deadline (transcription)"'::jsonb, 'OUR scenario: 8 server-hours arrive at 06:00, due 24 h later. Job size from measurements.json.'),
  ('jobs.batch', 'interruptible', 'true'::jsonb, 'OUR scenario: 8 server-hours arrive at 06:00, due 24 h later. Job size from measurements.json.'),
  ('jobs.batch', 'deadline_h', '24'::jsonb, 'OUR scenario: 8 server-hours arrive at 06:00, due 24 h later. Job size from measurements.json.'),
  ('jobs.batch', 'arrivals_server_h', '{"6": 8}'::jsonb, 'OUR scenario: 8 server-hours arrive at 06:00, due 24 h later. Job size from measurements.json.'),
  ('jobs.batch', 'when_heat_not_needed', '"move"'::jsonb, 'OUR scenario: 8 server-hours arrive at 06:00, due 24 h later. Job size from measurements.json.'),
  ('jobs.opportunistic', 'label', '"Opportunistic backlog (embeddings)"'::jsonb, 'ASSUMES AN UNLIMITED BACKLOG of deadline-free work (fleet-level queue). This is the single most optimistic assumption in the model.'),
  ('jobs.opportunistic', 'interruptible', 'true'::jsonb, 'ASSUMES AN UNLIMITED BACKLOG of deadline-free work (fleet-level queue). This is the single most optimistic assumption in the model.'),
  ('jobs.opportunistic', 'deadline_h', 'null'::jsonb, 'ASSUMES AN UNLIMITED BACKLOG of deadline-free work (fleet-level queue). This is the single most optimistic assumption in the model.'),
  ('jobs.opportunistic', 'unlimited', 'true'::jsonb, 'ASSUMES AN UNLIMITED BACKLOG of deadline-free work (fleet-level queue). This is the single most optimistic assumption in the model.'),
  ('jobs.opportunistic', 'when_heat_not_needed', '"pause"'::jsonb, 'ASSUMES AN UNLIMITED BACKLOG of deadline-free work (fleet-level queue). This is the single most optimistic assumption in the model.');

-- The fleet (#81): twelve more houses, eight in Basel and four in Bern, all SYNTHETIC. Names,
-- tanks, hot water and server counts are made up; each point sits in the named quarter, not on
-- a real house. One synthetic host account owns them all, so the reference host and buyer above
-- see exactly what they saw before. Jobs on these houses come from `make fleet` through
-- services/scheduler/fleet_write.py, not from this seed.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'fleet@kachel.test',
   extensions.crypt('kachel-demo', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"name": "Synthetic fleet host"}', now(), now(), '', '', '', '');

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005',
   '{"sub": "00000000-0000-4000-8000-000000000005", "email": "fleet@kachel.test", "email_verified": true}', 'email', now(), now(), now());

insert into public.sites (
  id, host_id, name, city, latitude, longitude, tank_kwh, hot_water_kwh_per_day, hot_water_shape
)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000005', 'Synthetic house, St. Johann', 'Basel', 47.5670, 7.5780, 35.0, 12.0, 'flat'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Gundeldingen', 'Basel', 47.5430, 7.5940, 50.0, 16.0, 'flat'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Matthäus', 'Basel', 47.5670, 7.5960, 20.0, 8.0, 'flat'),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Bachletten', 'Basel', 47.5480, 7.5720, 35.0, 10.0, 'flat'),
  ('00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Iselin', 'Basel', 47.5580, 7.5620, 30.0, 12.0, 'flat'),
  ('00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Breite', 'Basel', 47.5520, 7.6120, 45.0, 14.0, 'flat'),
  ('00000000-0000-4000-8000-000000001007', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Hirzbrunnen', 'Basel', 47.5720, 7.6150, 25.0, 9.0, 'flat'),
  ('00000000-0000-4000-8000-000000001008', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Gotthelf', 'Basel', 47.5560, 7.5670, 40.0, 18.0, 'flat'),
  ('00000000-0000-4000-8000-000000001009', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Länggasse', 'Bern', 46.9550, 7.4300, 35.0, 12.0, 'flat'),
  ('00000000-0000-4000-8000-000000001010', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Breitenrain', 'Bern', 46.9600, 7.4550, 50.0, 15.0, 'flat'),
  ('00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Kirchenfeld', 'Bern', 46.9400, 7.4500, 30.0, 11.0, 'flat'),
  ('00000000-0000-4000-8000-000000001012', '00000000-0000-4000-8000-000000000005', 'Synthetic house, Bümpliz', 'Bern', 46.9450, 7.3900, 20.0, 7.0, 'flat');

-- Their servers, each as config.json: server. House n has 2 + (n mod 7) servers (2 to 8), all
-- off until a job lands. Server ids end in 2HH0S: HH = house, S = slot.
insert into public.servers (id, site_id, slot, name, power_kw, heat_recovery, idle_power_kw, state)
select
  ('00000000-0000-4000-8000-00000002' || lpad(house::text, 2, '0') || '0' || slot::text)::uuid,
  ('00000000-0000-4000-8000-0000000010' || lpad(house::text, 2, '0'))::uuid,
  slot, 'Server ' || slot, 1.0, 0.8, 0.0, 'OFF'
from generate_series(1, 12) as house
cross join lateral generate_series(1, 2 + house % 7) as slot;
