# Job types

Every value the model uses is listed in [assumptions.md](assumptions.md), generated from
`services/scheduler/config.json`. This page gives the sizes and sources behind the job types. Embeddings and the local
AI chat are measured on our machine with a GPU power meter ([measurements.md](measurements.md), #194); transcription is
cited (#18). Image and video tagging, at the end, are cited from MLPerf (#159); image tagging is also measured on our
machine, next to the cited figure.

## Batch with a deadline: speech to text

The job: transcribe a batch of recordings with Whisper large-v3, the model MLPerf uses for its
speech-to-text benchmark.

| What                  | Value                                     | Source                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime               | 24.7 GPU seconds per hour of audio        | RTFx 145.51 for Whisper large-v3 on one NVIDIA A100-SXM4-80GB, batch 64 ([Open ASR Leaderboard, Srivastav et al., arXiv:2510.06961, Table 3](https://arxiv.org/abs/2510.06961)): 3,600 ÷ 145.51                                                                                                                                                         |
| Energy                | 2.75 Wh per hour of audio, GPU at TDP     | 24.7 s at the A100 80GB SXM's 400 W maximum TDP ([NVIDIA A100 datasheet, June 2021](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf)); GPU only, the host CPU not counted                                                                                                    |
| On the 1 kW reference | about 360 hours of audio a server-hour    | 1,000 Wh ÷ 2.75 Wh, with the same scaling rule as the measured jobs (equal energy per item)                                                                                                                                                                                                                                                             |
| Interruptible         | yes                                       | Each recording is transcribed on its own, so a paused job resumes at the next file. MLPerf runs it as an "offline" scenario: the whole batch is there at the start, nobody waits on one item ([Red Hat, MLPerf Inference v6.0, 1 Apr 2026](https://www.redhat.com/en/blog/red-hat-ai-tops-mlperf-inference-v60-vllm-qwen3-vl-whisper-and-gpt-oss-120b)) |
| Deadline              | 24 hours                                  | The completion window of OpenAI's Batch API, which accepts `24h` only, at half the price of the synchronous API ([OpenAI, Batch API guide](https://developers.openai.com/api/docs/guides/batch), read 21 Nov 2026)                                                                                                                                      |
| Jobs a day            | 8 server-hours a house, arriving at 06:00 | OUR scenario (see below)                                                                                                                                                                                                                                                                                                                                |

### Cross-checks and what is ours

- **MLPerf.** Whisper large-v3 replaced RNN-T as MLPerf Inference's speech-to-text benchmark in v5.1, on LibriSpeech: 1,633 samples, about 30 hours of audio. In v6.0 two L40S GPUs reached 3,646.91 tokens a second offline, eight H200 36,395.70 (Red Hat, above). MLPerf counts decoder tokens, not audio, so those figures cannot be turned into hours of audio without the token count; we use the leaderboard's RTFx for the runtime and MLPerf to show this is a standard, published workload.
- **Alibaba trace.** The Alibaba PAI GPU trace (cluster-trace-gpu-v2020: over 6,500 GPUs on about 1,800 machines, July and August 2020) holds "a hybrid of training and inference jobs" ([alibaba/clusterdata](https://github.com/alibaba/clusterdata/tree/master/cluster-trace-gpu-v2020)). Arrivals per day could be counted from its job table; we have not downloaded the tables yet, so the daily volume stays ours.
- **The daily volume is ours.** 8 server-hours at 360 hours of audio each would be about 2,900 hours of audio a house a day, far more than one household makes. The batch is a fleet-level queue, like the backlog; the scheduler only needs its server-hours and its deadline.
- **Energy is the GPU at full TDP** and leaves out the host, so a real 1 kW box transcribes less than 360 hours an hour. Our metered chat run drew 257 W on a 260 W card, so full TDP is close to what a busy GPU draws. The heat is the same either way: 0.8 kWh per server-hour.

## Opportunistic backlog: embeddings

Measured: nomic-embed-text through Ollama on an RTX 2080 Ti, 174.4 texts a second at 68.2 W
above idle plus a stated CPU share: 33.2 Wh per job of 200,000 texts, about 30 jobs per 1 kW
server-hour ([measurements.md](measurements.md); raw samples and summary in
[measurements/](measurements/)). The backlog is assumed unlimited, the single most optimistic
assumption in the model.

## Interactive sessions

One evening block of 4 server-hours a house (18:00 to 22:00), not interruptible: OUR scenario.
The chat part is measured: qwen3:4b, thinking off, 136.7 tokens a second at 225.3 W above idle,
0.138 Wh per 256-token answer, about 7,200 answers per 1 kW server-hour
([measurements.md](measurements.md)).

## Image tagging: objects in photos, overnight

DigitalHeat named image and video tagging as work for its servers. A rail operator, such as SBB,
is a prospect with this kind of backlog: photos of stations and track, tagged for what is in them.
We have no partnership with any rail operator; the "rail operator" buyer in the demo is synthetic.

The job: detect and label the objects in each image. MLPerf Inference's object-detection
benchmark (RetinaNet on OpenImages, 800×800 pixels) is the closest published workload with
measured power. The scheduler runs it with its batch rule (`config.json: workloads.image_tagging`).

| What                  | Value                                      | Source                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime               | 0.72 GPU-ms an image (90 µs of the system) | MLPerf Inference v5.0, closed, datacenter, result **5.0-0023**: Fujitsu PRIMERGY CDI, 8× NVIDIA H100 NVL 94GB, TensorRT 10.8, RetinaNet, Offline, **11,106.2 images a second**, mAP 37.31 ([results row](https://github.com/mlcommons/inference_results_v5.0/tree/main/closed/Fujitsu/results/H100-NVL-94GBx8_TRT), `summary_results.json`): 8 ÷ 11,106.2 |
| Energy                | 0.4366 J an image (0.121 mWh)              | Same row: **4,848.69 W** for the whole system, measured at the wall with MLPerf's power method: 4,848.69 ÷ 11,106.2. Host, fans and power supply included                                                                                                                                                                                                 |
| On the 1 kW reference | about 8.2 million images a server-hour     | 3.6 MJ ÷ 0.4366 J, with the same scaling rule as the other jobs (equal energy per item)                                                                                                                                                                                                                                                                   |
| Interruptible         | yes                                        | Each image is tagged on its own; MLPerf's offline scenario hands the whole batch over at the start, so a paused job resumes at the next image                                                                                                                                                                                                             |
| Deadline              | 12 hours (in at 20:00, done by 08:00)      | OUR GUESS: an overnight batch                                                                                                                                                                                                                                                                                                                             |
| Jobs a day            | 2 server-hours a house, arriving at 20:00  | OUR GUESS                                                                                                                                                                                                                                                                                                                                                 |

### Measured on our machine

The same network family, run by us: torchvision's RetinaNet ResNet-50 FPN with its COCO weights,
fp32 in PyTorch, batches of 4, on our RTX 2080 Ti, over 300 synthetic 1280×720 frames we draw
ourselves (sky, ground, track lines, blocks and discs; no photo dataset). Two runs of 1,200 images
each ([measurements.md](measurements.md); raw samples and summary in [measurements/](measurements/)):

| What                  | Measured, RTX 2080 Ti                                   | Cited, MLPerf 5.0-0023 (above)    |
| --------------------- | ------------------------------------------------------- | --------------------------------- |
| Throughput            | 20.1 images a second                                    | 11,106.2 images a second, 8× H100 |
| Power                 | 220.5 W GPU above idle, plus a stated CPU share         | 4,848.69 W at the wall            |
| Energy                | 3.21 Wh per 1,000 images (11.5 J an image)              | 0.121 Wh per 1,000 (0.4366 J)     |
| On the 1 kW reference | about 312,000 images a server-hour                      | about 8.2 million                 |
| Repeatability         | the two runs agree within 0.2 %                         |                                   |
| Accuracy              | **not measured**: synthetic frames have no ground truth | mAP 37.31 on OpenImages           |

Ours costs about 26 times the energy per image. MLPerf's row is TensorRT tuned for the benchmark
on data-centre H100s, with 800×800 inputs; ours is untuned fp32 PyTorch on a 2018 consumer card,
and the model scales our frames to 1333×750, 1.6 times the pixels. The two are the ends of a
range. The scheduler counts server-hours, not images, so its results do not change either way.

## Video tagging: labels for recorded footage

The job: label what is in recorded footage, such as station and track video, frame by frame. It is
image tagging on sampled frames, plus decoding the video first
(`config.json: workloads.video_tagging`).

| What                  | Value                                                                      | Source                                                                                                                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frames tagged         | 1 a second, 3,600 an hour of footage                                       | Google Cloud Video Intelligence labels frames "with one frame per second sampling" ([label detection docs](https://docs.cloud.google.com/video-intelligence/docs/feature-label-detection), updated 10 Nov 2026)                                                                                              |
| Tagging energy        | 0.4366 Wh an hour of footage                                               | 3,600 frames × 0.4366 J, the image tagging cost above                                                                                                                                                                                                                                                        |
| Decode                | 41.4 s of one decoder engine an hour of footage                            | Every frame of 25 fps footage (OUR GUESS: the European frame rate) decoded: 90,000 frames ÷ 2,172 frames a second, 1080p H.264 on one Blackwell NVDEC engine ([NVIDIA, NVDEC Application Note, SDK 13.0](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.0/nvdec-application-note/index.html)) |
| On the 1 kW reference | decode sets the pace: about 87 hours of footage an hour per decoder engine | 3,600 s ÷ 41.4 s. A GPU with more decoder engines decodes more. By energy alone the tagging would allow about 2,300 hours of footage per server-hour; decoder energy is not published, so it is not counted                                                                                                  |
| Interruptible         | yes                                                                        | OUR GUESS: each clip is tagged on its own                                                                                                                                                                                                                                                                    |
| Deadline              | 24 hours a batch                                                           | OUR GUESS                                                                                                                                                                                                                                                                                                    |
| Jobs a day            | 2 server-hours a house, arriving at 22:00                                  | OUR GUESS                                                                                                                                                                                                                                                                                                    |

### What the tagging jobs change, and what is ours

- **They run with the batch rule.** Both are interruptible with a deadline, like the transcription
  batch, so the scheduler needs no new rule: they run as early as their heat is useful, and move
  to another house or a data centre at their last hour if no house can use the heat.
- **The yearly results do not use them.** The reference house keeps its 8 server-hours of
  transcription a day; the tagging jobs are sized and sourced here so a buyer can send them.
- **Why RetinaNet, not ResNet-50.** MLPerf Inference v5.0 and v5.1 publish no closed, datacenter
  ResNet-50 result with power; RetinaNet 5.0-0023 is the one with measured wall power.
- **Run by us for energy and throughput only.** `make measure-tagging` runs the image tagging
  job above on our GPU. It does not check what the model finds in the frames, and it leaves out
  reading and decoding image files. Video tagging is not run by us: at our measured cost, the
  3,600 frames of an hour of footage would take 11.5 Wh instead of 0.4366 Wh, decoding aside.
