# Assumptions

Every value the scheduler uses, from `services/scheduler/config.json`, with its unit and where it comes from.
The numbered sources are listed on [the economics page](economics/README.md#sources).
"Our guess" means no outside source backs the value yet.

This page is generated: change `config.json`, then run `node scripts/assumptions.mjs`.

## House

| What                                   | Key                     | Value | Unit | Source                     |
| -------------------------------------- | ----------------------- | ----- | ---- | -------------------------- |
| Hot-water tank                         | `tank_kwh`              | 35    | kWh  | [1] DigitalHeat case brief |
| Hot water a day                        | `hot_water_kwh_per_day` | 12    | kWh  | [1] DigitalHeat case brief |
| How hot water use spreads over the day | `hot_water_shape`       | flat  |      | our guess                  |

Note in config.json: DigitalHeat case brief (reference house). hot_water_shape=flat is OUR assumption; overridden when the case CSV is passed with --profile.

## Server

| What                                    | Key             | Value | Unit | Source                     |
| --------------------------------------- | --------------- | ----- | ---- | -------------------------- |
| Server power                            | `power_kw`      | 1     | kW   | [1] DigitalHeat case brief |
| Share of server power recovered as heat | `heat_recovery` | 80 %  |      | [1] DigitalHeat case brief |
| Power a paused server draws             | `idle_power_kw` | 0     | kW   | our guess                  |

Note in config.json: Case brief. idle_power_kw=0 is OUR simplification: a paused server is assumed to draw nothing.

## Prices

| What                                                | Key                           | Value | Unit    | Source                                                                            |
| --------------------------------------------------- | ----------------------------- | ----- | ------- | --------------------------------------------------------------------------------- |
| Electricity price                                   | `electricity_chf_per_kwh`     | 0.277 | CHF/kWh | [3] ElCom 2026 H4 median, a placeholder for Basel (IWB)                           |
| Heat pump efficiency (COP) the server heat replaces | `heat_pump_cop`               | 2.5   |         | [1] DigitalHeat case brief; field tests 2.6 to 4.9, [4] Fraunhofer ISE field test |
| Price of a server-hour of compute                   | `compute_chf_per_server_hour` | 0.5   | CHF     | our guess                                                                         |

Note in config.json: electricity: PLACEHOLDER = ElCom 2026 Swiss H4 median (27.7 Rp). REPLACE with IWB Basel H4 total from strompreis.elcom.admin.ch. COP: case brief. compute price: OUR assumption, shown only against the break-even.

## Model

| What                 | Key        | Value       | Unit | Source                               |
| -------------------- | ---------- | ----------- | ---- | ------------------------------------ |
| Heat demand forecast | `forecast` | persistence |      | our guess: the next hour as this one |

## Interactive jobs

| What                           | Key                    | Value                                                | Unit         | Source    |
| ------------------------------ | ---------------------- | ---------------------------------------------------- | ------------ | --------- |
| What it is                     | `label`                | Interactive sessions (local AI chat, game streaming) |              | our guess |
| Can be paused                  | `interruptible`        | false                                                |              | our guess |
| Deadline after arrival         | `deadline_h`           | 0 h                                                  |              | our guess |
| Server-hours arriving each day | `arrivals_server_h`    | 1 at 18:00, 1 at 19:00, 1 at 20:00, 1 at 21:00       | server-hours | our guess |
| When the house needs no heat   | `when_heat_not_needed` | run_and_dump                                         |              | our guess |

Note in config.json: OUR scenario: one evening session block of 4 h per house and day.

## Batch jobs

| What                           | Key                    | Value                               | Unit         | Source                                                                      |
| ------------------------------ | ---------------------- | ----------------------------------- | ------------ | --------------------------------------------------------------------------- |
| What it is                     | `label`                | Batch with deadline (transcription) |              | [21] MLPerf Inference v6.0, [19] Open ASR Leaderboard                       |
| Can be paused                  | `interruptible`        | true                                |              | [21] MLPerf Inference v6.0 (offline: the whole batch is there at the start) |
| Deadline after arrival         | `deadline_h`           | 24 h                                |              | [22] OpenAI Batch API                                                       |
| Server-hours arriving each day | `arrivals_server_h`    | 8 at 06:00                          | server-hours | our guess                                                                   |
| When the house needs no heat   | `when_heat_not_needed` | move                                |              | our guess                                                                   |

Note in config.json: Whisper large-v3 speech to text, the MLPerf Inference speech benchmark since v5.1. Interruptible per recording. Deadline 24 h: OpenAI Batch API completion window. Size: 24.7 GPU-s per audio hour (Open ASR Leaderboard RTFx 145.51 on A100), 2.75 Wh for the GPU at its 400 W TDP, host not counted, about 360 audio hours per 1 kW server-hour. 8 server-hours at 06:00 is OUR scenario. Sources: docs/job-types.md

## Backlog jobs

| What                         | Key                    | Value                              | Unit | Source                                              |
| ---------------------------- | ---------------------- | ---------------------------------- | ---- | --------------------------------------------------- |
| What it is                   | `label`                | Opportunistic backlog (embeddings) |      | [24] our measurement                                |
| Can be paused                | `interruptible`        | true                               |      | [24] our measurement: it checkpoints every 64 items |
| Deadline after arrival       | `deadline_h`           | none                               |      | our guess                                           |
| Backlog never runs out       | `unlimited`            | true                               |      | our guess                                           |
| When the house needs no heat | `when_heat_not_needed` | pause                              |      | our guess                                           |

Note in config.json: ASSUMES AN UNLIMITED BACKLOG of deadline-free work (fleet-level queue). This is the single most optimistic assumption in the model. Job size measured on our machine: 0.113 Wh and 34.2 CPU-s per 200,000 items, about 8,840 jobs per 1 kW server-hour (docs/measurements.md).

## Fleet (synthetic, make fleet)

| What                                       | Key                                  | Value          | Unit         | Source                                     |
| ------------------------------------------ | ------------------------------------ | -------------- | ------------ | ------------------------------------------ |
| Houses in the fleet                        | `houses`                             | 50             |              | our guess                                  |
| Random seed that draws the houses and jobs | `seed`                               | 2025           |              | our guess                                  |
| City whose weather every house gets        | `city`                               | Basel          |              | Open-Meteo archive, Basel 2025 (CC BY 4.0) |
| Latitude range of the houses               | `latitude`                           | 47.54 to 47.58 | °N           | our guess                                  |
| Longitude range of the houses              | `longitude`                          | 7.56 to 7.63   | °E           | our guess                                  |
| Servers per house                          | `servers_per_house`                  | 2 to 8         |              | our guess                                  |
| Hot-water tank                             | `tank_kwh`                           | 20 to 50       | kWh          | our guess                                  |
| Space heating, times the reference house   | `space_heating_scale`                | 0.4 to 1.6     |              | our guess                                  |
| Hot water a day                            | `hot_water_kwh_per_day`              | 6 to 18        | kWh          | our guess                                  |
| Interactive jobs a day, per house          | `interactive_jobs_per_house_per_day` | 4              |              | our guess                                  |
| Interactive jobs start from, until before  | `interactive_hours_of_day`           | 17 to 23       | h            | our guess                                  |
| Batch jobs a day, per house                | `batch_jobs_per_house_per_day`       | 4              |              | our guess                                  |
| Size of a batch job                        | `batch_hours`                        | 2 to 6         | server-hours | our guess                                  |
| Batch deadline after arrival               | `batch_deadline_h`                   | 8 to 24        | h            | our guess                                  |
| Backlog jobs a day, per house              | `backlog_jobs_per_house_per_day`     | 12             |              | our guess                                  |
| Size of a backlog job                      | `backlog_hours`                      | 1 to 4         | server-hours | our guess                                  |
| Backlog deadline after arrival             | `backlog_deadline_h`                 | 48             | h            | our guess                                  |
| Days run before the shown day              | `warmup_days`                        | 2              |              | our guess                                  |

Note in config.json: OUR synthetic scenario for make fleet (heatsched/fleet_scenario.py): every house is made up, drawn evenly from these ranges with this seed, on the real Basel 2025 weather. space_heating_scale multiplies the reference house's space heating. Unlike the one-house model, the backlog is finite and due within backlog_deadline_h, so work the houses cannot take shows up as moved to a data centre.

## Hardware

| What                          | Key                    | Value | Unit  | Source                    |
| ----------------------------- | ---------------------- | ----- | ----- | ------------------------- |
| Hardware case the results use | `case_for_results`     | mid   |       | our guess                 |
| Service fitter with van       | `service_chf_per_hour` | 125   | CHF/h | [12] WBAG Regietarif 2025 |
| Service call-out              | `service_callout_chf`  | 65    | CHF   | [12] WBAG Regietarif 2025 |

### Hardware cases

| What                        | Key                           | Low                               | Mid                              | High                       | Unit  | Source                                                                          |
| --------------------------- | ----------------------------- | --------------------------------- | -------------------------------- | -------------------------- | ----- | ------------------------------------------------------------------------------- |
| What it is                  | `label`                       | Refurbished GPU host, 6-year life | New GPU workstation, 5-year life | Dear GPU host, 4-year life |       | [9] PCSP server prices 2026, [10] VRLA Tech workstation 2026                    |
| Server, about 1 kW          | `server_chf`                  | 2518                              | 5034                             | 6714                       | CHF   | [9] PCSP server prices 2026, [10] VRLA Tech workstation 2026; 1 kW is our guess |
| Water loop to the tank      | `cooling_kit_chf`             | 496                               | 633                              | 771                        | CHF   | [11] Watercooling UK, our guess                                                 |
| Fitter hours per house      | `fitter_hours_per_house`      | 6                                 | 10                               | 16                         | h     | our guess                                                                       |
| Fitter rate                 | `fitter_chf_per_hour`         | 103                               | 120                              | 148                        | CHF/h | [12] WBAG Regietarif 2025                                                       |
| Electrician hours per house | `electrician_hours_per_house` | 2                                 | 3                                | 4                          | h     | our guess                                                                       |
| Electrician rate            | `electrician_chf_per_hour`    | 151                               | 151                              | 151                        | CHF/h | [13] EIT.nordwest rates 2026                                                    |
| Service visits a year       | `service_visits_per_year`     | 1                                 | 1                                | 2                          |       | our guess                                                                       |
| Hours per service visit     | `service_hours_per_visit`     | 1                                 | 2                                | 2                          | h     | our guess                                                                       |
| Lifetime                    | `lifetime_years`              | 6                                 | 5                                | 4                          | years | [14] SiliconANGLE, [15] Amazon 10-K 2025                                        |
| Discount rate               | `discount_rate`               | 3.28 %                            | 3.75 %                           | 6 %                        |       | [16] UVEK grid WACC, [17] pv magazine; high case our guess                      |

Notes in config.json:

- `server_chf`: low and high: the range USD 3,000 to 8,000 for a refurbished single-GPU inference host (PCSP, 'How much does a server cost in 2026?', 21 Aug 2026). mid: a new single-GPU AI workstation with an RTX PRO 6000 Blackwell (up to 600 W), from USD 5,999 (VRLA Tech, 30 Jun 2026). That each draws about 1 kW in use is OUR GUESS.
- `cooling_kit_chf`: A custom water loop for CPU and GPU costs GBP 450 to 700 (Watercooling UK, 29 Jul 2026); mid is the midpoint. That a plate heat exchanger to the tank costs about what the loop's radiator does is OUR GUESS.
- `fitter_chf_per_hour`: Heating and plumbing rates without VAT, 2025: B-Monteur 103, A-Monteur 120, Chefmonteur 148 CHF an hour (WBAG, Regietarif 2025).
- `electrician_chf_per_hour`: Elektroinstallateur EFZ, 151 CHF an hour without VAT (EIT.nordwest, Basel, recommended rates 2026).
- `hours_per_house`: Fitter and electrician hours to fit six servers to the tank: OUR GUESS.
- `service`: Service fitter with van 125 CHF an hour, call-out 65 CHF (WBAG, Regietarif 2025). Visits and hours a year: OUR GUESS.
- `lifetime_years`: 6: the large cloud providers' server life by 2023 (SiliconANGLE, 22 Nov 2025). 5: Amazon, for part of its servers from 1 Jan 2025 (Amazon 10-K 2025). 4: Amazon from 2020 (SiliconANGLE).
- `discount_rate`: 3.28%: WACC for Swiss power grids, tariff year 2027 (UVEK, 2 Mar 2026). 3.75%: WACC for PV investment contributions 2026 (pv magazine, 2 Mar 2026). 6%: OUR GUESS for a young, riskier business.
