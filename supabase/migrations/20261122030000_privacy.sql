-- Where a job may run (services/scheduler/heatsched/fleet.py, rule 6): anywhere ("any"), only on
-- Kachel's houses and never in the outside data centre ("swiss"), or only in its own building
-- ("site"), which it must name. Existing jobs keep today's behaviour.
alter table public.jobs
  add column privacy text not null default 'any',
  add constraint jobs_privacy_tier check (privacy in ('any', 'swiss', 'site')),
  add constraint jobs_site_tier_names_its_house check (privacy <> 'site' or site_id is not null),
  add constraint jobs_private_work_stays_on_houses check (privacy = 'any' or not moved_offsite);
