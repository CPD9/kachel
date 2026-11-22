# Measurements

Two real AI jobs run on our own machine, their GPU power metered, and scaled to the 1 kW
reference server (#194). The third job type, transcription, is cited, not measured: see
[job-types.md](job-types.md).

Raw meter samples and the summary are in [measurements/](measurements/):
`ai-embeddings-samples.csv` and `ai-inference-samples.csv` (every 100 ms reading, with its phase:
idle baseline or run) and `ai-summary.json` (every figure below). `make measure-ai` repeats the run.

## The opportunistic backlog: embeddings

| What                            | Value                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Model                           | nomic-embed-text (768 dimensions) through the local Ollama 0.33.3, fully on the GPU  |
| Input                           | 20,000 synthetic texts of 40 words (862,836 tokens), fixed seed, batches of 64       |
| Wall time, this machine         | 114.7 s                                                                              |
| Throughput, this machine        | 174.4 texts a second                                                                 |
| GPU power                       | 100.3 W mean against a 32.1 W idle baseline: 68.2 W above idle, 34 % utilisation     |
| GPU energy above idle           | 2.169 Wh (1,078 samples)                                                             |
| CPU share (stated)              | 1.156 Wh: Ollama's 349.7 CPU seconds above baseline × 11.9 W                         |
| Energy per text                 | 0.166 mWh (3.325 Wh ÷ 20,000)                                                        |
| One job                         | 200,000 texts, the size of `embed_job.py`: 33.2 Wh, about 19 minutes on this machine |
| Jobs per reference server-hour  | about 30 (6.0 million texts)                                                         |
| Runtime per job, 1 kW reference | 120 s                                                                                |
| Interruptible                   | yes: each batch of 64 stands on its own                                              |

## Interactive sessions: a local AI chat

| What                      | Value                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Model                     | qwen3:4b through the local Ollama, fully on the GPU, thinking off                          |
| Input                     | 24 fixed questions × 2 rounds = 48 answers, temperature 0, seed 7, up to 256 tokens each   |
| Wall time, this machine   | 91.1 s, one request at a time                                                              |
| Throughput, this machine  | 136.7 tokens a second decoding (134.9 over the wall time); every answer reached 256 tokens |
| GPU power                 | 257.1 W mean against a 31.8 W idle baseline: 225.3 W above idle, 90 % utilisation          |
| GPU energy above idle     | 5.700 Wh (846 samples)                                                                     |
| CPU share (stated)        | 0.937 Wh: Ollama's 283.5 CPU seconds above baseline × 11.9 W                               |
| Energy per answer         | 0.138 Wh, or 0.540 Wh per 1,000 tokens                                                     |
| Per reference server-hour | about 7,200 answers, 1.85 million tokens                                                   |
| Interruptible             | no: someone is waiting for the answer                                                      |

## Machine

- NVIDIA GeForce RTX 2080 Ti (260 W power limit, driver 610.57.04); Intel Core i7-9700K, 8 cores,
  95 W TDP (Intel ARK); Linux 7.2; Ollama 0.33.3 with models pulled earlier (nothing downloaded).
- Measured 22 November 2026, from 00:53 UTC.

## Method

```sh
make measure-ai        # cd services/scheduler && uv run python measure_ai.py
```

1. **Inputs are fixed.** The texts are synthetic, drawn with a fixed seed from a small English
   word list (`measure_ai.texts`), so nothing is copied and every run sees the same words. The
   questions are 8 topics in 3 forms (`measure_ai.prompts`).
2. **Both models are loaded before metering**, so reading them from disk is not counted, and
   Ollama reports them fully on the GPU.
3. **The GPU is shared** with Blender film renders. A run starts only when the GPU stays below
   5 % utilisation for 5 s with no Blender process on it; otherwise the script checks again every
   3 minutes, up to an hour (it waited once). A run is thrown away if Blender shows up on the GPU
   at any point during it (checked every 2 s).
4. **GPU power is metered**: `nvidia-smi --query-gpu=power.draw,utilization.gpu -lms 100`, board
   power, an instantaneous reading on this Turing card, ± 5 W by NVIDIA's own spec. Before each
   run, 15 s of the idle GPU with the models loaded give the baseline; the run's energy is the
   trapezoid sum of its samples minus that baseline times its duration.
5. **CPU power is not metered.** The package counter (RAPL,
   `/sys/class/powercap/intel-rapl:0/energy_uj`) is root-only here. The script counts the CPU
   seconds of the Ollama processes from `/proc` above their idle rate and prices them at the TDP
   split over the cores, 95 W ÷ 8 = 11.9 W per busy core. Where RAPL is readable, the script uses
   it instead.
6. **Scaling** to the reference server assumes equal energy per item (equal performance per
   watt), as `measure.py` did: items per server-hour = 1,000 Wh ÷ Wh per item. The server gives
   0.8 kWh of heat for it whatever runs (`config.json: server`).

## What this does not show

- **The CPU share is a stated figure, probably high.** Ollama's threads spin while they wait for
  the GPU, so they log CPU seconds at less than full power. It is 35 % of the embedding energy
  and 14 % of the chat energy.
- **One consumer GPU.** The embedding run keeps the GPU at 34 % utilisation (small model, CPU
  tokenising); a data-centre GPU with larger batches would embed more texts per watt. Equal
  performance per watt is therefore cautious for throughput, and says nothing about the heat.
- **The rest of the machine** (fans, memory, disk, power supply losses) is not counted, nor the
  idle draw: the figures are energy above idle. A plug meter would give the wall figure.
- **The scheduler's yearly balance does not use the job size.** It counts server-hours, and the
  backlog is assumed unlimited (`config.json: jobs.opportunistic`), so the economics do not change.

## Repeatability

A first run of the same script 13 minutes earlier (00:40 UTC), before the in-run Blender check,
gave 145.9 texts a second and 34.8 Wh per embedding job, and 135.6 tokens a second and 0.137 Wh
per answer. The chat figures agree within 1 %. The embeddings vary more (about 20 % in throughput, 5 % in
energy per job) because the CPU tokenises the texts and the machine had other work running.

## Earlier stand-in

`measure.py` (#77) timed the numpy hashing fallback of `jobs/embed_job.py` on the CPU and priced
it at 11.9 W per core from the TDP: 0.113 Wh for 200,000 texts. That was not a neural model and
not a meter reading; the figures above replace it.
