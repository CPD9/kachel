# Job types

Every value the model uses is listed in [assumptions.md](assumptions.md), generated from
`services/scheduler/config.json`. This page gives the sizes and sources behind the job types. Embeddings and the local
AI chat are measured on our machine with a GPU power meter ([measurements.md](measurements.md), #194); transcription is
cited (#18).

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
