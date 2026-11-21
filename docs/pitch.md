# Pitch and demo script

Five minutes at FHNW Campus Dreispitz, Basel, during the 36-hour sprint on Basel's climate
goal. Two slides, one Blender film we talk over, one live moment, then the ask.

- Slides: [docs/pitch/slides.md](pitch/slides.md) (Marp), rendered to
  [slides.pdf](pitch/slides.pdf). Every figure on them comes from
  `services/scheduler/out/kpis.json` or `docs/economics/data/summary.json`, with the source on
  the slide. Render with
  `npx @marp-team/marp-cli docs/pitch/slides.md --pdf --allow-local-files`.
- The two-minute film in talk-track order:
  [kachel-film-2min.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/kachel-film-2min.mp4)
  (1080p) or the
  [720p copy](https://github.com/CPD9/kachel/releases/download/media-v1/kachel-film-2min-720p.mp4);
  `make video-film-2min` rebuilds it from the rendered parts.
- Film segments: [docs/media](media/README.md) and the
  [media-v1 release](https://github.com/CPD9/kachel/releases/tag/media-v1).
- How the parts fit: [docs/architecture.md](architecture.md).
- Charts, sources and open questions: [the numbers behind Kachel](economics/README.md).

Every figure said aloud below is on a slide or in a film frame. Say "space heating and hot
water", never a single room or appliance.

## Who does what

- **Peter** speaks throughout and clicks the slides.
- **Duc** sits at the demo laptop: plays the film, runs the live flip, switches the projector
  between the film and the host app.
- **Loyola** keeps the clock and holds up a card at 2:30 and 4:30.
- **Nikolas** takes questions on the numbers.

## Running order

| Time      | Length | On screen                                                                                | Source                |
| --------- | ------ | ---------------------------------------------------------------------------------------- | --------------------- |
| 0:00–0:10 | 10 s   | Title slide                                                                              | `pitch/slides.md`     |
| 0:10–0:45 | 35 s   | Slide 1: the problem and the idea                                                        | `pitch/slides.md`     |
| 0:45–1:21 | 36 s   | Day-night film: Basel outside, the plant room inside, one clock                          | `make video-daynight` |
| 1:21–1:41 | 20 s   | [setup.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/setup.mp4)         | media-v1              |
| 1:41–2:07 | 26 s   | [scheduler.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/scheduler.mp4) | media-v1              |
| 2:07–2:32 | 25 s   | Charts: month (9 s), break-even (8 s), what moves the result (8 s)                       | media-v1              |
| 2:32–3:32 | 60 s   | Live: the host app on the local stack                                                    | demo laptop           |
| 3:32–4:35 | 63 s   | Slide 2: the numbers and the ask                                                         | `pitch/slides.md`     |
| 4:35–5:00 | 25 s   | Slide 2 stays; close and team                                                            | `pitch/slides.md`     |

The day-night film is still rendering (24 hours in 36 s, the January day). Until it is in the
release, show the [skyline at dusk](media/skyline-dusk.webp) for those 36 s and say the same
lines.

## Talk track

### 0:00–0:10, title

"Your AI heats your home. We are Kachel."

### 0:10–0:45, slide 1

- 0:10 "Basel-Stadt voted to reach net zero by 2037."
- 0:17 "Data centres used 415 terawatt-hours in 2024, about one and a half percent of the
  world's electricity. Their heat is cooled away."
- 0:30 "Meanwhile homes here still burn oil and gas for space heating and hot water."
- 0:37 "So we put the servers in the basement, and run their AI jobs only when the house can
  use the heat."

### 0:45–1:21, day-night film (36 s, 1.5 s per hour)

- 0:45 (00:00 on the film clock) "Left, Basel. Right, one house's plant room. Same clock, a
  real January day."
- 0:57 (08:00) "Morning: the house wants heat, the servers are busy."
- 1:09 (16:00) "Towards dusk the lights come on, and the radiators still want heat."
- 1:18 (22:00) "All night the heat goes into the tank instead of a cooling tower."

### 1:21–1:41, setup (20 s)

- 1:21 "What goes into a basement: six water-cooled servers in a rack."
- 1:28 "Supply and return pipes, a plate heat exchanger, a pump, and the tank with a backup
  heater."
- 1:36 "Running: server heat goes straight into the tank."

### 1:41–2:07, scheduler (26 s)

- 1:41 "13 January at noon: six of six servers run, and the backup heater still adds a little."
- 1:50 "Evening: a live session takes one server, the backlog fills the other five."
- 1:58 "15 July: the tank is full, so the backlog pauses. Only work with a deadline runs."
- 2:04 "Live sessions now, deadlines when heat is wanted, the backlog fills the rest, otherwise
  off."

### 2:07–2:32, charts (25 s)

- 2:07 month (9 s): "Servers run almost all of December to February, and about a tenth of
  summer hours. Summer is the hard part."
- 2:16 break-even (8 s): "Below 0.188 francs a server-hour it does not pay, before hardware."
- 2:24 what moves the result (8 s): "Two things decide it: the price a server-hour fetches,
  and whether there is always flexible work waiting."

### 2:32–3:32, live (60 s)

Before the talk, Duc has run `make dev`, started the embedding job, and started the agent on
Server 4 with `--tick 0.2` (command in `services/agent/.env.example`), signal file
`/tmp/heat` holding `run`. The host app is open full screen, Server 4 shows Running.

- 2:32 Duc switches the projector to the host app. Peter: "This is the host app, live on
  our laptop. Server 4 is running a real embedding job."
- 2:42 Peter: "Now the tank is full." Duc runs `echo pause > /tmp/heat`.
- 2:45 The agent stops the process and writes to Supabase; Realtime pushes it and the pill
  turns Paused in under a second. Peter: "The agent paused the job. No reload: the screen
  heard it from the database."
- 3:00 Peter: "The house wants heat again." Duc runs `echo run > /tmp/heat`. The pill turns
  Running.
- 3:10 Peter: "Same job, same process, carried on where it stopped. Nothing lost, nothing
  dumped."
- 3:20 Duc switches back to the slides.

If the stack is not up, Duc plays
[live-demo.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/live-demo.mp4)
(30 s) and Peter says the same lines over it.

### 3:32–4:35, slide 2

- 3:32 "One Basel house, six servers, real 2025 weather. Server heat covers 79.6 percent of
  the heat demand, and the house sells 31,075 server-hours a year."
- 3:47 "Before hardware it pays from 0.188 francs a server-hour. We assume 0.50."
- 3:57 "That leaves 9,683 francs a year before hardware. After hardware, mid case, 1,415, and
  the hardware pays back in 4.2 years."
- 4:12 "The buyer pays for compute, the home gets the heat. Next, one scheduler for many homes
  sends each job to wherever the heat is useful now."
- 4:22 "Our ask: a Basel building for a pilot, buyers of compute that can pause, and a
  fitter's quote."

### 4:35–5:00, close

"For homeowners and building operators who want cheaper heat, and buyers who want compute
that does double duty. Your AI heats your home. Thank you." Then the team: Peter, Duc,
Loyola, Nikolas.
