# Data and sources

Kachel uses public and synthetic data only. No real person or house is described anywhere in the
repo. This page lists every outside source, what we use it for, and its terms. Where a value has
no outside source, we say "our guess".

## Open data the apps and the model read

| Source                                                  | What we use it for                                                  | Terms and credit                                                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| swisstopo swissBUILDINGS3D, as 3D Tiles                 | Every building on the map, streamed while it is open                | Free with the credit "© swisstopo", fair use ([FSDI terms](https://www.geo.admin.ch/en/general-terms-of-use-fsdi))                                                                              |
| swisstopo terrain (quantized mesh)                      | The ground under the map                                            | Same terms                                                                                                                                                                                      |
| swisstopo SWISSIMAGE aerial photos                      | The map's ground imagery                                            | Same terms; about 20,000 users a day counts as fair use                                                                                                                                         |
| BFS federal building and dwelling register (GWR)        | Built year, heated area, storeys, dwellings and heating on the card | Level A data are public and free to use; credit "Source: BFS GWR"                                                                                                                               |
| SFOE Sonnendach (`ch.bfe.solarenergie-eignung-daecher`) | Each building's estimated heat demand for heating and hot water     | SFOE, data status 21.02.2023; credit "Source: SFOE"                                                                                                                                             |
| SFOE heat demand per hectare                            | Heat demand across the city, on the card and in a render            | SFOE, 2014 building and 2013 company statistics; credit "Source: SFOE"                                                                                                                          |
| OpenStreetMap tiles                                     | The map outside Switzerland                                         | "© OpenStreetMap contributors", data under the [ODbL](https://www.openstreetmap.org/copyright); [tile policy](https://operations.osmfoundation.org/policies/tiles/)                             |
| Open-Meteo historical weather API, built on ECMWF ERA5  | Hourly temperature and sunshine for Basel and Bern in 2025          | CC BY 4.0. Zippenfenig (2023), [doi:10.5281/zenodo.7970649](https://doi.org/10.5281/zenodo.7970649); Hersbach et al. (2023), [doi:10.24381/cds.adbb2d47](https://doi.org/10.24381/cds.adbb2d47) |
| CesiumJS 1.147                                          | Draws the 3D globe, terrain and buildings                           | Apache-2.0                                                                                                                                                                                      |

Nothing from swisstopo is copied into the repo: the map streams tiles from swisstopo's own
servers, and asks GWR and SFOE only when you click a building. The credits sit in the map's
footer at all times. The two weather files are saved unchanged in
[`services/scheduler/tests/data`](https://github.com/CPD9/kachel/tree/main/services/scheduler/tests/data),
fetched on 21 Nov 2026.

The Basel skyline in the films uses swissBUILDINGS3D 3.0, 2024 edition, © swisstopo. FHNW
Campus Dreispitz is too new for that edition, so in the films it is a block model from its
published floor area; its shape and orientation are our guesses. The loop from a tower to its
neighbours in one render is a concept, not an existing system.

## Figures we quote

These are published numbers we cite, not data sets we copy. Each is listed with its link and the
date we read it on the
[economics page](https://github.com/CPD9/kachel/blob/main/docs/economics/README.md#sources), in
the numbered list the [assumptions page](https://github.com/CPD9/kachel/blob/main/docs/assumptions.md)
refers to.

| Topic               | Sources                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The reference house | DigitalHeat case brief: 35 kWh tank, 12 kWh hot water a day, 1 kW server, 80% heat recovery, COP 2.5, the heating formula                                                                                                   |
| Heating degree days | SIA 381/3 (20/12 rule), station Basel-Binningen; HEV Schweiz heating degree days 2025 for Basel and Bern                                                                                                                    |
| Electricity prices  | ElCom: Swiss H4 median 27.7 Rp (2026) and 26.5 Rp (2027); IWB Basel H4 33.42 Rp and C3 32.6 Rp (2027), from strompreis.elcom.admin.ch                                                                                       |
| Heat pumps          | Fraunhofer ISE field test: seasonal COP 3.4 on average, 2.6 to 4.9                                                                                                                                                          |
| Hardware            | PCSP and VRLA Tech server prices 2026; Watercooling UK loop prices; WBAG and EIT.nordwest hourly rates; SiliconANGLE and Amazon 10-K on server life; UVEK and pv magazine discount rates; ECB exchange rates of 20 Nov 2026 |
| Solar and battery   | JRC PVGIS 5.3; EnergieSchweiz PV price study 2025; Swissolar fact sheet 2025; CKW on the federal one-off payment; IWB feed-in tariff                                                                                        |
| Sun and sky model   | Spencer (1971), Erbs, Klein and Duffie (1982), Liu and Jordan (1963)                                                                                                                                                        |
| Buildings           | Hochbauamt Basel-Stadt project sheet for the HGK tower; BFS dwelling size; BFE on older buildings; SIA 380/1 hot-water values; Kanton Zürich office limits; GEAK                                                            |
| Job types           | Open ASR Leaderboard (arXiv:2510.06961); NVIDIA A100 datasheet; MLPerf Inference v6.0 (Red Hat); OpenAI Batch API; the Alibaba GPU trace (cited, not downloaded)                                                            |
| Context             | IEA, Energy and AI (2025): data centres used about 415 TWh in 2024; SRF on Basel-Stadt's vote for net zero by 2037                                                                                                          |

## Our own measurement

One job type is measured on our own machine, an Intel Core i7-9700K, on 21 Nov 2026: the
embedding job, 34.2 CPU seconds and 0.113 Wh for 200,000 texts, about 8,840 jobs per 1 kW
server-hour. The power is the chip's design limit split over its cores, not a meter reading.
Method and limits: [measurements.md](https://github.com/CPD9/kachel/blob/main/docs/measurements.md).

## Our guesses

A value with no outside source is marked "our guess" on the
[assumptions page](https://github.com/CPD9/kachel/blob/main/docs/assumptions.md). The ones that
matter most:

- Compute sells at 0.50 CHF a server-hour. Only the break-even is a result.
- There is always a backlog of flexible work. This is the most optimistic assumption.
- A paused server draws nothing.
- Each house has one 4-hour evening session and 8 server-hours of batch work a day.
- Each server in the hardware cases draws about 1 kW; fitting takes 6, 10 or 16 fitter hours.
- The 10 kWp roof, the 10 kWh battery and its 90% round trip.
- Every fleet house is made up, drawn from ranges in `config.json: fleet`.

## Synthetic data

The local database is filled from
[`supabase/seed.sql`](https://github.com/CPD9/kachel/blob/main/supabase/seed.sql): one host, one
buyer, the Basel reference house, its six servers and a few jobs. Every value is made up or comes
from the scheduler's own output. The fleet's 100 houses are made up too.

Our own code is under the MIT licence.
