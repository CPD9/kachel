# Measurements

One job type measured on our own machine and scaled to the 1 kW reference server (#12).
The second job type is cited, not measured: see [assumptions.md](assumptions.md).

## The opportunistic backlog: embeddings

| What                            | Value                                                                    |
| ------------------------------- | ------------------------------------------------------------------------ |
| Job                             | `services/scheduler/jobs/embed_job.py`, 200,000 texts of 40 words        |
| Workload                        | numpy hashing-embedding, 384 dimensions (the fallback, not a neural net) |
| Runtime per job, this machine   | 34.2 CPU seconds (two runs: 34.19 s and 34.27 s)                         |
| Throughput, this machine        | about 5,840 items a CPU second                                           |
| Energy per job                  | 0.113 Wh (34.2 s × 11.9 W)                                               |
| Jobs per reference server-hour  | about 8,840                                                              |
| Runtime per job, 1 kW reference | 0.41 s                                                                   |
| Interruptible                   | yes: it checkpoints after every batch of 64 and resumes from the file    |

## Machine

- Intel Core i7-9700K, 8 cores, 8 threads, 3.6 GHz base, 95 W TDP (Intel ARK); Linux 7.2, Python 3.12.15, numpy 2.5.5 with OpenBLAS.
- Measured 21 November 2026, 12:32 to 12:37 UTC, on CPU only.
- The machine was busy with other work (load average 8 to 15 on 8 cores), so the job had a share of the CPU, not all of it. CPU seconds, not wall time, are what we count.

## Method

```sh
cd services/scheduler
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  uv run python measure.py --seconds 60 --device-watts 11.9 --items-per-job 200000
```

1. `measure.py` starts the real job, waits, reads its checkpoint and stops it. The job counts its own CPU time (`time.process_time`), which does not advance while it is paused.
2. BLAS runs on one thread, so one CPU second is one core busy for one second.
3. **Power is stated, not metered.** The package energy counter (RAPL) is root-only on this machine, so we take the TDP split evenly over the cores: 95 W ÷ 8 = 11.9 W per busy core. TDP is a design limit, not a reading; a plug meter would replace it.
4. **Scaling** to the reference server assumes equal energy per item (equal performance per watt), as in `measure.py`. A 1 kW server then does 1,000 ÷ 0.113 ≈ 8,840 of these jobs an hour and gives 0.8 kWh of heat for it (`config.json: server`).

## What this does not show

- It is not neural inference. With `sentence-transformers` installed the job runs all-MiniLM-L6-v2; that needs a model download of about 90 MB, which we have not made.
- A GPU server does far more items per watt than a desktop CPU, so equal performance per watt is cautious for throughput and says nothing about the heat, which is 0.8 kWh per server-hour whatever runs.
- The scheduler's yearly balance does not use the job size: the backlog is assumed unlimited (`config.json: jobs.opportunistic`).
