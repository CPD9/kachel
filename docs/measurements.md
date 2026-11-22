# Measurements

Three real AI jobs run on our own machine, their GPU power metered, and scaled to the 1 kW
reference server: embeddings and chat (#194), and image tagging, next to its MLPerf citation.
Transcription and video tagging are cited, not measured: see [job-types.md](job-types.md).

Raw meter samples and the summary are in [measurements/](measurements/):
`ai-embeddings-samples.csv` and `ai-inference-samples.csv` (every 100 ms reading, with its phase:
idle baseline or run) and `ai-summary.json`; for image tagging `tagging-run1-samples.csv`,
`tagging-run2-samples.csv` and `tagging-summary.json`. `make measure-ai` and `make measure-tagging`
repeat the runs.

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

## Overnight batch: image tagging

| What                      | Value                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Model                     | torchvision RetinaNet ResNet-50 FPN, COCO weights (34.0 million parameters), fp32, fully on the GPU |
| Input                     | 300 synthetic 1280×720 frames, fixed seed, drawn by us; 4 passes = 1,200 images a run, batches of 4 |
| Wall time, this machine   | 59.7 s and 59.6 s (two runs)                                                                        |
| Throughput, this machine  | 20.1 images a second                                                                                |
| GPU power                 | 252.8 W mean against a 32.3 W idle baseline: 220.5 W above idle, 95 % utilisation                   |
| GPU energy above idle     | 3.656 Wh and 3.650 Wh (571 and 569 samples)                                                         |
| CPU share (stated)        | 0.196 Wh: the script's 59.2 CPU seconds above baseline × 11.9 W                                     |
| Energy per image          | 3.21 Wh per 1,000 images (11.5 J an image)                                                          |
| Per reference server-hour | about 312,000 images                                                                                |
| Cited figure, for scale   | MLPerf 5.0-0023: 0.4366 J an image, about 8.2 million a server-hour ([job-types.md](job-types.md))  |
| Accuracy                  | **not measured**: the frames are synthetic and have no ground truth; only energy and throughput are |
| Interruptible             | yes: each image is tagged on its own                                                                |

The run counts frames already in memory going to the GPU, the model's own resize (shorter side to
800 pixels: 1333×750) and normalisation, detection, and the boxes, labels and scores above 0.5
coming back to the CPU. Reading and decoding image files is not counted. The weights (136.6 MB,
`retinanet_resnet50_fpn_coco-eeacb38b.pth`) were the only download.

## Machine

- NVIDIA GeForce RTX 2080 Ti (260 W power limit, driver 610.57.04); Intel Core i7-9700K, 8 cores,
  95 W TDP (Intel ARK); Linux 7.2; Ollama 0.33.3 with models pulled earlier (nothing downloaded).
- Measured 22 November 2026, from 00:53 UTC; image tagging from 02:21 UTC, PyTorch 2.15.0 and
  torchvision 0.29.2 (CUDA 13.2 build) in their own environment, not the scheduler's.

## Method

```sh
make measure-ai        # cd services/scheduler && uv run python measure_ai.py
TORCH_PY=/path/to/venv/bin/python make measure-tagging   # measure_tagging.py, needs torch
```

1. **Inputs are fixed.** The texts are synthetic, drawn with a fixed seed from a small English
   word list (`measure_ai.texts`), so nothing is copied and every run sees the same words. The
   questions are 8 topics in 3 forms (`measure_ai.prompts`). The tagging frames are drawn the
   same way (`measure_tagging.frames`): a sky gradient, ground, two track lines, blocks and discs.
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
   it instead. For image tagging the script counts its own CPU seconds the same way.
6. **Scaling** to the reference server assumes equal energy per item (equal performance per
   watt), as `measure.py` did: items per server-hour = 1,000 Wh ÷ Wh per item. The server gives
   0.8 kWh of heat for it whatever runs (`config.json: server`).

## What this does not show

- **The CPU share is a stated figure, probably high.** Ollama's threads spin while they wait for
  the GPU, so they log CPU seconds at less than full power. It is 35 % of the embedding energy
  and 14 % of the chat energy, 5 % of the tagging energy.
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

The two image tagging runs, each with its own gate and idle baseline, agree within 0.2 % in
throughput and in energy per image. The second waited once at the gate (3 minutes) while the GPU's
utilisation reading from the first fell back; the script now waits 30 s between runs instead.

## Earlier stand-in

`measure.py` (#77) timed the numpy hashing fallback of `jobs/embed_job.py` on the CPU and priced
it at 11.9 W per core from the TDP: 0.113 Wh for 200,000 texts. That was not a neural model and
not a meter reading; the figures above replace it.
