# FAQ

Honest answers, including the ones that are not in our favour.

## What happens in summer?

The house needs only hot water, so the servers run about 10% of the hours in June, July and
August (`docs/economics/data/monthly.csv`). Flexible work pauses; work with a deadline moves to a
house that can use its heat, or to a data centre. In the July fleet runs, about 55% of the jobs'
heat went into houses and the rest to data centres. A summer heat sink, such as district heating
or a neighbour's pool, is the open question (issue
[#66](https://github.com/CPD9/kachel/issues/66)).

## And in winter, does the house need more power?

Yes. Six 1 kW servers use about 31,000 kWh of electricity a year, most of it from November to
March. The house gets 79.6% of its heat from them in return, and the backup heater makes the
rest. A 10 kWp roof covers 18.6% of the servers' power over the year, mostly in summer when
they need least. Solar trims the bill; it does not remove it.

## Does it pay?

Before hardware, yes, from 0.188 CHF a server-hour. With hardware it needs 0.30 to 0.61 CHF,
depending on what the servers cost and how long they last. At our assumed 0.50 CHF, the mid case
leaves 2,965 CHF a year and pays back in 4.0 years, over a six-year life with the servers
sold at the end; the high case does not pay back within its
life. See [The numbers](The-numbers).

## Are these figures measured?

Mostly not. They are model results on real 2025 Basel weather, with inputs from the case brief
and from cited sources. Two AI jobs are measured on our own machine with a GPU power meter. No server has been fitted to a
real tank yet. Values without a source are marked "our guess" on the
[assumptions page](https://github.com/CPD9/kachel/blob/main/docs/assumptions.md).

## What is the weakest assumption?

That there is always flexible work waiting. Without it, utilisation falls from 59.1% to 8.3% and
the house loses money. Next come the compute price and the hardware price.

## Is the fleet real?

The routing code is real and tested. The houses are made up: 50 in Basel and 50 in Bern, drawn
from ranges in `config.json`, on the real 2025 weather of each city. Nothing routes a job
submitted in the console live yet; it waits as Queued.

## Does pausing a job lose work?

No. The agent freezes the process with `SIGSTOP` and it keeps its memory. On `SIGCONT` it
carries on where it stopped. The embedding job also saves its progress after every batch, so it
can be restarted from file.

## What does a paused server draw?

The model assumes nothing. A real server draws some power when idle, which would raise the cost.
That is our simplification.

## Why Basel?

The hackathon is in Basel, and Basel-Stadt voted in 2022 to reach net zero by 2037. Its weather,
its tariffs (IWB) and its buildings are all public, so the numbers can be checked.

## Is my data used?

No. Kachel uses public and synthetic data only. The demo accounts and the houses are made up, and
the map asks public services about a building only when you click it.

## Can I use the code?

Yes, under the MIT licence. Map data has its own terms: see
[Data and sources](Data-and-sources).
