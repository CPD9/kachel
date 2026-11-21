# Team

Four people built Kachel at the DigitalHeat hackathon in Basel.

| Who        | GitHub                                     | On stage                                         |
| ---------- | ------------------------------------------ | ------------------------------------------------ |
| Peter Dike | [@CPD9](https://github.com/CPD9)           | Speaks throughout and clicks the slides          |
| Duc        | [@bila9630](https://github.com/bila9630)   | Runs the demo laptop, the film and the live flip |
| Loyola     | [@Loyola-sk](https://github.com/Loyola-sk) | Keeps the clock                                  |
| Nikolas    | [@Ni93c42l](https://github.com/Ni93c42l)   | Takes questions on the numbers                   |

The roles come from the [pitch script](https://github.com/CPD9/kachel/blob/main/docs/pitch.md).
Who wrote what is in the [merged pull requests](https://github.com/CPD9/kachel/pulls?q=is%3Apr+is%3Amerged).

## How we got here

Built in 36 hours, one issue and one pull request at a time:

1. **The foundation.** Local Supabase, the schema, the Basel reference house as seed data,
   row level security with a test for each policy, Realtime, typed clients (#1 to #9).
2. **The model.** The scheduler imported and tested, the yearly balance from one command, the
   Basel 2025 profile, a measured job and a cited one (#12, #16 to #20).
3. **The live job.** The agent pauses and resumes a real process, and the host screen follows
   within a second (#19, #25).
4. **The numbers.** Economics with sources, hardware payback, the IWB tariff, solar and a
   battery, more buildings and tariffs (#27, #28, #47).
5. **The apps.** The console's job list and submit form, sign-in for both apps, the host's house,
   day and money, which house each job landed on (#13, #14, #82, #84, #90).
6. **The fleet.** Jobs routed across 50 Basel houses, then Bern and both cities, written to the
   database (#79 to #81, #105).
7. **The map and the films.** Basel in 3D at dusk with a card for each building; the heat loop,
   the plant room, the scheduler and the day-night film in Blender (#24, #56, #61, #63, #102).

## What comes next

From the [open issues](https://github.com/CPD9/kachel/issues):

- **The full pitch film**, stitched from its rendered parts
  ([#117](https://github.com/CPD9/kachel/issues/117)), with the day-night film's framing and
  clock fixed ([#96](https://github.com/CPD9/kachel/issues/96)).
- **The agent reports a state only once it has changed**
  ([#112](https://github.com/CPD9/kachel/issues/112)).
- **On the map:** a month slider on the building card
  ([#64](https://github.com/CPD9/kachel/issues/64)), district heating networks beside Kachel's
  idea ([#66](https://github.com/CPD9/kachel/issues/66)), what Kachel servers would cover in a
  building ([#67](https://github.com/CPD9/kachel/issues/67)).
- **Stretch:** a 3D cutaway house ([#8](https://github.com/CPD9/kachel/issues/8)), talking to the
  house through the local model ([#26](https://github.com/CPD9/kachel/issues/26)), solar mapped in
  OpenStreetMap ([#65](https://github.com/CPD9/kachel/issues/65)), zooming out from Basel to Bern
  and the globe ([#68](https://github.com/CPD9/kachel/issues/68)), a building's interior
  ([#69](https://github.com/CPD9/kachel/issues/69)), a devcontainer
  ([#29](https://github.com/CPD9/kachel/issues/29)).

Beyond the hack, the scheduler should write the agent's signal itself, a submitted job should be
placed on a house live, and the [research topics](https://github.com/CPD9/kachel/blob/main/docs/economics/README.md#research-topics-for-the-report)
should replace our guesses with evidence.

## Our ask

A Basel building for a pilot, buyers of compute that can pause, and a fitter's quote.
