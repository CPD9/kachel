-- The fleet (#81): a job the fleet sent to an ordinary data centre because no house could use
-- its heat in time (services/scheduler/heatsched/fleet.py). It has left the houses, so it has no
-- house or server; services/scheduler/fleet_write.py sets it from `make fleet`.
alter table public.jobs
  add column moved_offsite boolean not null default false,
  add constraint jobs_offsite_has_no_house check (not moved_offsite or (site_id is null and server_id is null));

comment on column public.jobs.moved_offsite is
  'The fleet moved this job to a data centre: no house could use its heat before its deadline.';
