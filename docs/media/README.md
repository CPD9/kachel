# Media

Renders for the pitch video, made in Blender. Every figure on screen is read from the
scheduler's output or from [docs/economics/data](../economics/data) at render time, never
typed by hand. The videos are in the [media-v1 release](https://github.com/CPD9/kachel/releases/tag/media-v1).

## In the basement

![The plant room with each part labelled: server rack, pump, heat exchanger, tank and backup heater](setup.webp)

How a server goes into a basement: rack, supply and return, pump, plate heat exchanger,
tank and backup heater. [Video, 20 s](https://github.com/CPD9/kachel/releases/download/media-v1/setup.mp4)

![13 January 2025 at 12:00: six servers running, the backup heater adding 3.7 kWh](scheduler-january.webp)

![15 July 2025 at 19:00: the tank is full, so the flexible backlog is paused while one evening session runs](scheduler-july.webp)

The scheduler on a cold January day and a warm July day in Basel, 2025. Jobs run when the
house can use their heat, and the backlog pauses when the tank is full.
[Video, 25 s](https://github.com/CPD9/kachel/releases/download/media-v1/scheduler.mp4)

![A close-up of one server in the rack](server-closeup-34.webp)

## Live demo

![The host app with six servers: Server 4 runs its embeddings job](live-running.webp)

![The same screen a moment later: Server 4's job is paused, no heat sink](live-paused.webp)

The host app on the local stack. The agent follows a real embedding job on Server 4. When its
signal file says pause, it stops the process and writes the change to Supabase, and the pill
turns Paused under a second later; on run it turns back.
[Video, 27 s](https://github.com/CPD9/kachel/releases/download/media-v1/live-demo.mp4)

## The numbers

![Heat from servers and backup, month by month, with utilisation](chart-month.webp)
![Break-even price per server-hour: 0.188 CHF](chart-breakeven.webp)
![What moves the yearly result most](chart-sensitivity.webp)

Videos: [month by month](https://github.com/CPD9/kachel/releases/download/media-v1/chart-month.mp4), [break-even](https://github.com/CPD9/kachel/releases/download/media-v1/chart-breakeven.mp4),
[what moves the result](https://github.com/CPD9/kachel/releases/download/media-v1/chart-sensitivity.mp4). Sources for every input are on the
[economics page](../economics/README.md).

## Scaling up

![FHNW Campus Dreispitz as a block model, cut away to show a plant room in the basement](dreispitz-cutaway.webp)
![The basement plant room of the campus block model](dreispitz-basement-plantroom.webp)

The campus is too new for swisstopo's 2024 data, so it is a block model from its published
floor area. Its shape and orientation are our assumptions.

![Basel at dusk across the Rhine](skyline-dusk.webp)
![Concept: a server plant room in the base of the tallest tower feeding a local loop to six neighbours](skyline-servers-loop.webp)
![Heat demand per hectare in Basel](skyline-heatdemand.webp)

The loop to the neighbours is a concept, not an existing system. Buildings © swisstopo
(swissBUILDINGS3D 3.0, 2024 edition). Heat demand per hectare: SFOE, data status 2013.
