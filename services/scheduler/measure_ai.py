"""Measure two real AI jobs on this machine with a software power meter, then scale them to the 1 kW reference server.

  uv run python measure_ai.py            (or: make measure-ai)

1. Embeddings: nomic-embed-text through the local Ollama API over a fixed synthetic text set.
2. Inference: qwen3:4b answering a fixed batch of prompts, thinking off, greedy decoding.

Energy is metered, not taken from a rated TDP:
- GPU: `nvidia-smi --query-gpu=power.draw,utilization.gpu -lms 100` sampled through each run. The idle
  baseline (the models loaded, nothing running) is sampled before each run and subtracted.
- CPU: the package counter (RAPL, /sys/class/powercap/intel-rapl:0/energy_uj) when it is readable.
  When it is not (root-only on many machines), the Ollama processes' CPU seconds are counted from
  /proc and priced at the CPU's TDP per core, a stated share, not a reading.

The GPU is shared (Blender renders). A run starts only when the GPU is below 5 % utilisation with no
Blender process on it; otherwise it waits and checks again, up to an hour. A run is thrown away and
repeated when Blender appears at any point during it (checked every 2 s).

Scaling: equal energy per item on the reference server (equal performance per watt), as in measure.py.
Writes docs/measurements/ai-<kind>-samples.csv (raw meter samples) and docs/measurements/ai-summary.json.
"""

from __future__ import annotations

import argparse
import contextlib
import csv
import itertools
import json
import os
import platform
import random
import subprocess
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

OLLAMA = "http://127.0.0.1:11434"
EMBED_MODEL = "nomic-embed-text:latest"
CHAT_MODEL = "qwen3:4b"
RAPL = Path("/sys/class/powercap/intel-rapl:0/energy_uj")
REFERENCE_WH = 1000.0  # one server-hour of the 1 kW reference server (config.json: server.power_kw)
BUSY_UTIL_PCT = 5.0

# Words for the synthetic text set: plain English, no source text, so nothing is copied.
WORDS = (  # noqa: SIM905 (one string reads better than a list of 104 words)
    "heat water tank house basement server job hour day night winter summer cold warm city street "
    "roof pipe pump boiler radiator floor wall window door family morning evening weather sun snow "
    "rain wind power grid price meter energy batch queue model answer question text page note list "
    "number table small large quiet busy slow fast early late new old clean safe full empty open "
    "closed local remote runs keeps moves stores sends reads writes waits starts stops heats cools "
    "saves pays needs gives the a of to in on for with from by at and or but when while after before "
    "because so then"
).split()

# The inference batch: fixed questions a household or an operator might ask a local assistant.
TOPICS = (
    "how a hot water tank keeps its heat overnight",
    "why a heat pump works less well in deep winter",
    "what a server in the basement does with its waste heat",
    "how to read an electricity bill with day and night rates",
    "what a batch job with a deadline is",
    "why some computing work can be paused and resumed",
    "how solar panels on a roof change across the seasons",
    "what heating degree days measure",
)
FORMS = (
    "Explain in about 120 words {}.",
    "Give three short bullet points on {}.",
    "In plain words, for a homeowner: {}?",
)


def texts(n: int, words: int = 40, seed: int = 2025) -> list[str]:
    """n synthetic texts of `words` words each, the same on every run."""
    rng = random.Random(seed)
    return [" ".join(rng.choice(WORDS) for _ in range(words)) for _ in range(n)]


def prompts() -> list[str]:
    """The fixed inference batch: every topic in every form, 24 prompts."""
    return [form.format(topic) for topic in TOPICS for form in FORMS]


def energy_wh(samples: list[tuple[float, float]], t0: float, t1: float) -> float:
    """Energy between t0 and t1 from (time s, power W) samples: trapezoids, held flat to the edges."""
    pts = sorted(s for s in samples if t0 <= s[0] <= t1)
    if not pts:
        return 0.0
    pts = [(t0, pts[0][1]), *pts, (t1, pts[-1][1])]
    joules = sum((b[0] - a[0]) * (a[1] + b[1]) / 2 for a, b in itertools.pairwise(pts))
    return joules / 3600


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


@dataclass
class Meter:
    """nvidia-smi sampling every 100 ms in the background; each line timestamped as it arrives."""

    samples: list[tuple[float, float, float]] = field(default_factory=list)  # (monotonic s, W, util %)
    proc: subprocess.Popen | None = None

    def start(self) -> None:
        cmd = ["nvidia-smi", "--query-gpu=power.draw,utilization.gpu", "--format=csv,noheader,nounits", "-lms", "100"]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        assert self.proc and self.proc.stdout
        for line in self.proc.stdout:
            with contextlib.suppress(ValueError):
                w, u = (float(x) for x in line.split(","))
                self.samples.append((time.monotonic(), w, u))

    def stop(self) -> None:
        if self.proc:
            self.proc.terminate()
            self.proc.wait()

    def window(self, t0: float, t1: float) -> list[tuple[float, float, float]]:
        return [s for s in self.samples if t0 <= s[0] <= t1]


def gpu_state(window_s: float = 5.0) -> tuple[float, bool]:
    """(highest utilisation % over window_s seconds, whether a Blender process is on the GPU)."""
    util = 0.0
    for _ in range(int(window_s / 0.5)):
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        util = max(util, float(out.split()[0]))
        time.sleep(0.5)
    return util, blender_on_gpu()


def blender_on_gpu() -> bool:
    table = subprocess.run(["nvidia-smi"], capture_output=True, text=True, check=True).stdout
    return "blender" in table.lower()


class BlenderWatch:
    """Looks for a Blender process on the GPU every few seconds while a run is going."""

    def __init__(self, every_s: float = 2.0) -> None:
        self.seen = False
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, args=(every_s,), daemon=True)

    def _loop(self, every_s: float) -> None:
        while not self._stop.is_set():
            self.seen = self.seen or blender_on_gpu()
            self._stop.wait(every_s)

    def __enter__(self) -> BlenderWatch:
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        self._thread.join()
        self.seen = self.seen or blender_on_gpu()


def wait_for_idle_gpu(max_wait_s: float, every_s: float) -> None:
    """Return when the GPU is below 5 % with no Blender on it; check again every few minutes, up to max_wait_s."""
    deadline = time.monotonic() + max_wait_s
    while True:
        util, blender = gpu_state()
        if util < BUSY_UTIL_PCT and not blender:
            return
        if time.monotonic() > deadline:
            raise SystemExit(f"GPU still busy after {max_wait_s / 60:.0f} min (util {util} %, blender {blender})")
        print(f"GPU busy (util {util} %, blender {blender}); checking again in {every_s / 60:.0f} min", flush=True)
        time.sleep(every_s)


def ollama_cpu_s() -> float:
    """CPU seconds (user + system) of every process owned by the user the Ollama server runs as."""
    tick = os.sysconf("SC_CLK_TCK")
    uids = set()
    pids = [p for p in os.listdir("/proc") if p.isdigit()]
    for p in pids:
        with contextlib.suppress(OSError):
            if Path(f"/proc/{p}/comm").read_text().strip() == "ollama":
                uids.add(os.stat(f"/proc/{p}").st_uid)
    total = 0
    for p in pids:
        with contextlib.suppress(OSError):
            if os.stat(f"/proc/{p}").st_uid in uids:
                fields = Path(f"/proc/{p}/stat").read_text().rsplit(")", 1)[1].split()
                total += int(fields[11]) + int(fields[12])  # utime, stime
    return total / tick


def rapl_uj() -> int | None:
    try:
        return int(RAPL.read_text())
    except OSError:
        return None


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        OLLAMA + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


def run_embed(items: list[str], batch: int) -> dict:
    done = tokens = 0
    for i in range(0, len(items), batch):
        r = post("/api/embed", {"model": EMBED_MODEL, "input": items[i : i + batch], "keep_alive": "30m"})
        done += len(r["embeddings"])
        tokens += r.get("prompt_eval_count", 0)
    return {"items": done, "input_tokens": tokens, "dimensions": len(r["embeddings"][0])}


def run_infer(batch: list[str], max_tokens: int) -> dict:
    out = {"items": 0, "output_tokens": 0, "input_tokens": 0, "decode_s": 0.0, "prefill_s": 0.0}
    for p in batch:
        r = post(
            "/api/chat",
            {
                "model": CHAT_MODEL,
                "messages": [{"role": "user", "content": p}],
                "think": False,
                "stream": False,
                "keep_alive": "30m",
                "options": {"temperature": 0, "seed": 7, "num_predict": max_tokens, "num_ctx": 2048},
            },
        )
        out["items"] += 1
        out["output_tokens"] += r["eval_count"]
        out["input_tokens"] += r["prompt_eval_count"]
        out["decode_s"] += r["eval_duration"] / 1e9
        out["prefill_s"] += r["prompt_eval_duration"] / 1e9
    return out


@dataclass
class Phase:
    name: str
    t0: float
    t1: float


def measure(
    kind: str, work, meter: Meter, a: argparse.Namespace, cpu_s=ollama_cpu_s, cpu_who: str = "Ollama"
) -> tuple[dict, list[Phase]]:
    """Wait for an idle GPU, sample the idle baseline, run the work, and repeat if Blender showed up.

    cpu_s counts the CPU seconds of whoever does the work (Ollama by default; measure_tagging.py counts itself).
    """
    for _attempt in range(10):
        wait_for_idle_gpu(a.max_wait_min * 60, a.check_every_min * 60)
        b0 = time.monotonic()
        cpu_b0, rapl_b0 = cpu_s(), rapl_uj()
        time.sleep(a.baseline_s)
        b1 = time.monotonic()
        cpu_b1, rapl_b1 = cpu_s(), rapl_uj()
        base = meter.window(b0, b1)
        if max(s[2] for s in base) >= BUSY_UTIL_PCT:
            print(f"{kind}: GPU not idle during the baseline; trying again", flush=True)
            continue
        t0 = time.monotonic()
        cpu0, rapl0 = cpu_s(), rapl_uj()
        with BlenderWatch() as watch:
            result = work()
        t1 = time.monotonic()
        cpu1, rapl1 = cpu_s(), rapl_uj()
        if watch.seen:
            print(f"{kind}: Blender was on the GPU during the run; discarding it", flush=True)
            continue
        break
    else:
        raise SystemExit(f"{kind}: no clean run in 10 attempts")

    wall = t1 - t0
    base_w = mean([s[1] for s in base])
    pw = [(s[0], s[1]) for s in meter.samples]
    gpu_total = energy_wh(pw, t0, t1)
    gpu_above = gpu_total - base_w * wall / 3600
    run = meter.window(t0, t1)

    cpu_base_rate = (cpu_b1 - cpu_b0) / (b1 - b0)
    cpu_busy_s = max(0.0, (cpu1 - cpu0) - cpu_base_rate * wall)
    if None not in (rapl_b0, rapl_b1, rapl0, rapl1):
        rapl_base_w = (rapl_b1 - rapl_b0) / 1e6 / (b1 - b0)
        cpu_wh = ((rapl1 - rapl0) / 1e6 - rapl_base_w * wall) / 3600
        cpu_method = "RAPL package energy above its idle baseline (metered)"
    else:
        cpu_wh = cpu_busy_s * a.cpu_watts_per_core / 3600
        cpu_method = (
            f"RAPL not readable without root; {cpu_who}'s CPU seconds above baseline x {a.cpu_watts_per_core} W "
            "per busy core (95 W TDP / 8 cores, stated, not metered)"
        )
    total_wh = gpu_above + cpu_wh
    m = {
        "workload": kind,
        "wall_s": round(wall, 2),
        **result,
        "items_per_s": round(result["items"] / wall, 2),
        "gpu_idle_baseline_w": round(base_w, 2),
        "gpu_mean_w_during_run": round(mean([s[1] for s in run]), 2),
        "gpu_w_above_idle": round(mean([s[1] for s in run]) - base_w, 2),
        "gpu_mean_util_pct": round(mean([s[2] for s in run]), 1),
        "gpu_samples": len(run),
        "gpu_wh_total": round(gpu_total, 4),
        "gpu_wh_above_idle": round(gpu_above, 4),
        f"{cpu_who.lower().replace(' ', '_')}_cpu_s_above_baseline": round(cpu_busy_s, 2),
        "cpu_wh": round(cpu_wh, 4),
        "cpu_method": cpu_method,
        "wh_above_idle": round(total_wh, 4),
        "wh_per_item": total_wh / result["items"],
        "items_per_reference_server_hour": round(REFERENCE_WH / (total_wh / result["items"])),
    }
    phases = [Phase(f"{kind}_baseline", b0, b1), Phase(kind, t0, t1)]
    return m, phases


def write_samples(path: Path, meter: Meter, phases: list[Phase]) -> None:
    lo, hi = phases[0].t0, phases[-1].t1
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t_s", "phase", "power_w", "util_pct"])
        for t, pw, u in meter.window(lo, hi):
            phase = next((p.name for p in phases if p.t0 <= t <= p.t1), "between")
            w.writerow([f"{t - lo:.3f}", phase, f"{pw:.2f}", f"{u:.0f}"])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--embed-items", type=int, default=20000, help="texts in the measured embedding run")
    ap.add_argument("--embed-batch", type=int, default=64)
    ap.add_argument("--embed-job-items", type=int, default=200000, help="texts in one embedding job (embed_job.py)")
    ap.add_argument("--max-tokens", type=int, default=256, help="answer length cap for qwen3:4b")
    ap.add_argument("--rounds", type=int, default=2, help="times the 24-prompt batch is run")
    ap.add_argument("--baseline-s", type=float, default=15)
    ap.add_argument("--cpu-watts-per-core", type=float, default=11.9)
    ap.add_argument("--max-wait-min", type=float, default=60)
    ap.add_argument("--check-every-min", type=float, default=3)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "docs" / "measurements")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)

    items, batch = texts(a.embed_items), prompts() * a.rounds
    # Load both models before metering so the load from disk is not counted, and check they sit on the GPU.
    post("/api/embed", {"model": EMBED_MODEL, "input": items[:8], "keep_alive": "30m"})
    run_infer(batch[:1], 16)
    with urllib.request.urlopen(OLLAMA + "/api/ps") as r:
        loaded = {m["name"]: m.get("size_vram", 0) / max(m.get("size", 1), 1) for m in json.load(r)["models"]}

    time.sleep(30)  # let the warm-up's utilisation reading fall back before the first gate
    meter = Meter()
    meter.start()
    time.sleep(1)
    started = datetime.now(UTC)
    try:
        emb, emb_ph = measure("embeddings", lambda: run_embed(items, a.embed_batch), meter, a)
        write_samples(a.out / "ai-embeddings-samples.csv", meter, emb_ph)
        inf, inf_ph = measure("inference", lambda: run_infer(batch, a.max_tokens), meter, a)
        write_samples(a.out / "ai-inference-samples.csv", meter, inf_ph)
    finally:
        meter.stop()

    emb_job_wh = emb["wh_per_item"] * a.embed_job_items
    emb.update(
        model=EMBED_MODEL,
        text_set=f"{a.embed_items} synthetic texts of 40 words (seed 2025, measure_ai.texts), "
        f"batches of {a.embed_batch}",
        job=f"{a.embed_job_items} texts (the embedding job's size, embed_job.py)",
        wh_per_job=round(emb_job_wh, 3),
        jobs_per_reference_server_hour=round(REFERENCE_WH / emb_job_wh, 2),
        runtime_per_job_s_on_reference_server=round(3600 * emb_job_wh / REFERENCE_WH, 1),
        wh_per_item=round(emb["wh_per_item"], 8),
    )
    tok = inf["output_tokens"]
    inf.update(
        model=CHAT_MODEL,
        prompts=f"{len(batch)} answers: {len(prompts())} fixed prompts (measure_ai.prompts) x {a.rounds} rounds",
        settings=f"think off, temperature 0, seed 7, up to {a.max_tokens} tokens, one request at a time",
        decode_tokens_per_s=round(tok / inf["decode_s"], 1),
        output_tokens_per_wall_s=round(tok / inf["wall_s"], 1),
        mean_tokens_per_answer=round(tok / inf["items"], 1),
        job="one answer",
        wh_per_job=round(inf["wh_per_item"], 5),
        wh_per_1000_output_tokens=round(1000 * inf["wh_above_idle"] / tok, 4),
        jobs_per_reference_server_hour=inf.pop("items_per_reference_server_hour"),
        output_tokens_per_reference_server_hour=round(REFERENCE_WH * tok / inf["wh_above_idle"]),
        wh_per_item=round(inf["wh_per_item"], 6),
        decode_s=round(inf["decode_s"], 2),
        prefill_s=round(inf["prefill_s"], 2),
    )
    gpu = subprocess.run(
        ["nvidia-smi", "--query-gpu=name,driver_version,power.limit", "--format=csv,noheader"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    with urllib.request.urlopen(OLLAMA + "/api/version") as r:
        ollama_version = json.load(r)["version"]
    summary = {
        "measured_utc": started.strftime("%Y-%m-%d %H:%M"),
        "machine": {
            "gpu": gpu,
            "cpu": "Intel Core i7-9700K, 8 cores, 95 W TDP",
            "os": f"{platform.system()} {platform.release()}",
            "ollama": ollama_version,
            "models_share_on_gpu": {k: round(v, 2) for k, v in loaded.items()},
            "rapl_readable": rapl_uj() is not None,
        },
        "meter": (
            "nvidia-smi power.draw (board power, instantaneous on Turing, +/- 5 W) and utilization.gpu every 100 ms; "
            "energy by trapezoids over the run, minus the mean idle baseline sampled just before it"
        ),
        "gate": "each run starts only with the GPU below 5 % and no Blender process on it",
        "scaling_rule": "equal energy per item on the 1 kW reference server (equal performance per watt): "
        "items per server-hour = 1,000 Wh / Wh per item, with Wh per item = (GPU above idle + CPU share) / items",
        "raw_samples": ["ai-embeddings-samples.csv", "ai-inference-samples.csv"],
        "embeddings": emb,
        "inference": inf,
    }
    (a.out / "ai-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
