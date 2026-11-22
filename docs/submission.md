# Submission

The text for the hackathon form, field by field, ready to paste. The key figures are written
from `services/scheduler/out/kpis.json` by `node scripts/readme-figures.mjs`; CI fails if they
drift. Rebuild the project ZIP with `scripts/submission/zip.sh`.

## Project title

Kachel

## Slogan

Pick one (each under 100 characters):

1. Your AI heats your home: basement servers run AI jobs only when the house wants the heat.
2. Kachel puts AI jobs in home basements, so households get heat and buyers get compute.
3. Server heat for Swiss homes: AI jobs run when the house needs heat and pause when it doesn't.

## Description

### The problem

> "Servers turn almost all the electricity they use into heat, and that heat is usually cooled
> away with even more energy. At the same time, homes spend money and energy to produce heat.
> Which computing workloads fit, how to schedule them against a home's heat demand across the
> year, and when it pays off is still an open question. Build alternatives to big data
> centres."
>
> DigitalHeat, case brief "Useful Load ⇒ Useful Heat"

### Our solution

Kachel puts small water-cooled servers in a home's basement. Their heat goes through a plate
heat exchanger into the hot-water tank, for space heating and hot water. A scheduler decides
every hour which jobs run: live sessions first, jobs with a deadline when the house wants
heat, a pausable backlog to fill the rest, otherwise off. When the tank is full the backlog
pauses; a deadline job that cannot wait moves to another house or a data centre. Hosts see
their house, servers and heat in the host app; buyers submit and follow jobs in the console;
an operator view shows the whole fleet and its revenue.

The AI that runs the house runs in the house. The scheduler and the agent work on the box,
and "Ask your house" in the host app is answered by a local model, qwen3:4b through Ollama,
on the same computer: no cloud model, and the household's questions and data stay in the
house. Buyers send AI work such as transcription and image and video tagging; it runs on the
house's servers, close to where the data is made.

### How it works, and what is real

One pure scheduler function drives both the yearly balance on real 2025 Basel weather and
the live demo, where it pauses and resumes a real process with SIGSTOP and SIGCONT. On stage
an agent does the same from a heat signal and writes each change to Supabase, and the host
app shows it within a second through Realtime. Every assumption, with its unit and source,
is in `docs/assumptions.md`.

<!-- prettier-ignore-start -->
<!-- figures:start -->
| Figure | Value |
| --- | --- |
| Servers per house | 6 |
| Heat demand, space heating and hot water | 31,231 kWh |
| Share of heat demand covered | 80 % |
| Heat dumped | 9 kWh |
| Server utilisation | 59 % |
| Server-hours sold per year | 31,075 |
| Missed deadlines | 0.0 % |
| Electricity cost per year | CHF 8,608 |
| Compute income per year | CHF 15,538 |
| Break-even per server-hour | CHF 0.19 |

It does not pay off when compute earns less than CHF 0.19 per server-hour.

Source: Open-Meteo archive, Basel 2025
<!-- figures:end -->
<!-- prettier-ignore-end -->

| What                                                                      | Status                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| Weather (Open-Meteo archive, Basel and Bern 2025)                         | Real                                           |
| Scheduler, yearly balance, economics                                      | Real code, our model                           |
| Agent pausing and resuming a real process                                 | Real                                           |
| Embedding and chat jobs, measured on our machine and scaled to 1 kW       | Real, GPU power metered; CPU share stated      |
| Transcription job                                                         | Cited from published benchmarks, not run by us |
| Image and video tagging jobs (MLPerf RetinaNet 5.0-0023, NVIDIA NVDEC)    | Cited from published benchmarks, not run by us |
| Local AI: "Ask your house" on qwen3:4b through Ollama, no cloud model     | Real, on the same computer; energy metered     |
| Building data: GWR, SFOE heat demand and Sonnendach, ElCom prices         | Real public data                               |
| Supabase with Realtime and row level security                             | Real, local stack                              |
| 3D map: swisstopo buildings and imagery                                   | Real                                           |
| Fleet houses, buyer accounts, jobs in the apps                            | Synthetic                                      |
| Demo transcript and the questionnaire figures in Duc's pitch intro (#156) | Synthetic                                      |
| Scheduler writing the agent's signal; live placement of submitted jobs    | Real, on a replayed day; hash-chained log      |
| ORC turbine with a heat-pump booster, district heating as a summer sink   | Concept, outlook only                          |

### What's next, with four more weeks

1. Run the live loop on real time: `make live LIVE_ARGS="--source db --tick 3600"` reads
   `heat_state` for the clock's hour, which a heat meter in the house would write.
2. Meter the power with a plug meter, and run a neural embedding and a Whisper job on a GPU
   box instead of citing them.
3. Prices from real compute buyers who accept pauses, and the reference house's yearly
   balance on its own municipality's ElCom tariff, as the map card already does (#174).
4. One Basel pilot building with a fitter's quote, and a summer heat sink worked out with the
   district heating operator.
5. A pilot with a rail operator's tagging backlog (station and track images and video), run
   overnight on the pilot building's servers, measured against the cited figures in
   [job-types.md](job-types.md).

## Repository URL

https://github.com/CPD9/kachel

Setup steps are under "Run it" in the README; the live demo steps are in
[docs/demo-checklist.md](demo-checklist.md).

## Video pitch URL

Draft, without voice-over:
https://github.com/CPD9/kachel/releases/download/media-v1/kachel-pitch-draft.mp4

The final cut with the recorded voice-over replaces it under the same name in the media-v1
release.

## Project ZIP

`kachel-submission.zip`, built by `scripts/submission/zip.sh`: the model paper, the slides,
the pitch film, the demo checklist, and a README-FIRST.txt naming each file.

## Thumbnail

[docs/media/thumbnail-600.png](media/thumbnail-600.png): the 3D map of Basel at dusk with a
building's energy card open, cropped from [map-card.webp](images/map-card.webp).

## Must-haves on the reference house

| Must-have                                                                                   | Evidence                                                                                                                                                                                                                                                              | Status                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| At least two job types with runtime, energy, interruptible, deadline, jobs a day and source | [job-types.md](job-types.md): transcription batch (24 h deadline, cited) and embedding backlog; interactive sessions as a third (#77)                                                                                                                                 | Met                                                                                                 |
| One job type measured on our machine and scaled to 1 kW                                     | [measurements.md](measurements.md), `make measure-ai` (#194)                                                                                                                                                                                                          | Met; power from TDP, not metered                                                                    |
| The same scheduler code pauses and resumes one real process on the heat signal              | `make live` (`services/scheduler/live.py`) runs `decide()` from `heatsched/scheduler.py` each tick and writes the agent's signal; the agent holds a real job with SIGSTOP/SIGCONT (#191); "Why this decision" in the host app shows each decision and its hash (#197) | Met; no hand on stage. Every decision is hash-chained and `make verify-live` replays it             |
| Yearly balance: servers, heat covered, dumped, utilisation, missed deadlines, cost, income  | `make year` writes `services/scheduler/out/kpis.json` (#44); figures above                                                                                                                                                                                            | Met                                                                                                 |
| Break-even CHF per server-hour, and when it does not pay off                                | `kpis.json`, [economics/README.md](economics/README.md) charts 4 to 7, the no-backlog case                                                                                                                                                                            | Met                                                                                                 |
| Every assumption visible                                                                    | [assumptions.md](assumptions.md), generated from `config.json` (#75); [the model paper](paper/kachel-model.pdf) (#153)                                                                                                                                                | Met; the reference house uses the ElCom median, the map card each municipality's ElCom price (#174) |
| Pitch: key figures first, a January day, a July day, an interrupted job                     | [slides](pitch/slides.pdf), [pitch.md](pitch.md), the day-night films in [media](media/README.md), [live-demo.mp4](https://github.com/CPD9/kachel/releases/download/media-v1/live-demo.mp4)                                                                           | Met; the voice-over is still to record                                                              |

The single most optimistic assumption is an unlimited pausable backlog. Without it the house
sells far fewer server-hours; the no-backlog case is in
[docs/economics/data/summary.json](economics/data/summary.json).

## Links

- Repository: https://github.com/CPD9/kachel
- Wiki: [docs/wiki/Home.md](wiki/Home.md)
- Model paper: [docs/paper/kachel-model.pdf](paper/kachel-model.pdf)
- Media and films: [docs/media](media/README.md) and the
  [media-v1 release](https://github.com/CPD9/kachel/releases/tag/media-v1)
- Demo checklist: [docs/demo-checklist.md](demo-checklist.md)
