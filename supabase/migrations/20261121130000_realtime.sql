-- Realtime (#6): the apps hear about a server, job or heat_state change as it happens, so the
-- host screen shows a job pause and resume without a reload. Each row is sent as it is after
-- the change; row level security (#3) decides later who may hear which rows.
alter publication supabase_realtime add table public.servers, public.jobs, public.heat_state;
