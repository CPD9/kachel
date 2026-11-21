# How it works

Each home has servers and a hot-water tank in the basement. A server runs AI jobs only when
the house can use the heat. Boxes marked "next" are not built yet.

```mermaid
flowchart LR
  subgraph home["One home (services/scheduler config: six 1 kW servers, 35 kWh tank)"]
    servers["Servers running AI jobs"]
    tank["Plate heat exchanger and tank:<br/>space heating and hot water"]
    sched["House scheduler<br/>services/scheduler<br/>decides every hour"]
    agent["Agent<br/>services/agent<br/>pauses and resumes the job"]
    servers -- "heat" --> tank
    tank -- "tank level, heat demand" --> sched
    sched -. "run / pause<br/>(signal file, by hand in the demo)" .-> agent
    agent -- "SIGSTOP / SIGCONT" --> servers
  end

  supa[("Supabase<br/>sites, servers, jobs, heat_state<br/>Realtime on")]
  host["Host app<br/>apps/host<br/>their house and servers"]
  console["Console app<br/>apps/console<br/>the buyer's jobs"]
  fleet["Fleet scheduler (next)<br/>routes each job to a home<br/>whose heat is useful now"]
  outlook["District heating and solar (next)<br/>summer heat sink, own power<br/>issues #66 and #27"]

  agent -- "job and server state" --> supa
  supa -- "Realtime" --> host
  supa -- "Realtime" --> console
  console -. "submit a job (next, #14)" .-> fleet
  fleet -. "job" .-> sched
  tank -. "heat the house cannot use" .-> outlook
```

What each box is in the repo:

| Box                         | Where                                            | State                                                         |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| House scheduler             | `services/scheduler/heatsched/scheduler.py`      | Built. Moves a deadline job off site when it has no heat sink |
| Agent                       | `services/agent`                                 | Built. Follows a run/pause signal file and writes to Supabase |
| Supabase and Realtime       | `supabase/migrations`, `packages/db/src/live.ts` | Built. Realtime on `servers`, `jobs` and `heat_state`         |
| Host app                    | `apps/host`                                      | Built. Shows each server and its job live                     |
| Console app                 | `apps/console`                                   | Built. Lists jobs and their state; submit form is next (#14)  |
| Fleet scheduler             | none yet                                         | Next. Today each home decides alone                           |
| District heating and solar  | issues #66 and #27                               | Next. The outlook for summer heat and cheaper power           |
| Scheduler writes the signal | `services/scheduler`, `services/agent`           | Next. On stage the signal file is written by hand             |
