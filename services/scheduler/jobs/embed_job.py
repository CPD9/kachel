"""A real, checkpointed embedding job. The scheduler pauses/resumes this process.

Uses sentence-transformers (all-MiniLM-L6-v2) if installed -> real AI inference on CPU.
Falls back to a numpy hashing-embedding so the demo still runs with no model download
(say so in the pitch if you use the fallback).
Progress is written after every batch, so the job can also be killed and restarted.
"""
import json, os, sys, time, zlib
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else "out/job_progress.json"
TOTAL, BATCH = int(os.environ.get("JOB_ITEMS", 200000)), int(os.environ.get("JOB_BATCH", 64))
WORDS = "heat server basel winter tank water compute job pause resume storage kilowatt home embed".split()
rng = np.random.default_rng(0)

def texts(n):
    return [" ".join(rng.choice(WORDS, 40)) for _ in range(n)]

try:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
    embed, kind = (lambda b: model.encode(b, batch_size=len(b))), "sentence-transformers/all-MiniLM-L6-v2"
except Exception:
    proj = rng.standard_normal((8192, 384)).astype(np.float32)
    def embed(b):
        x = np.zeros((len(b), 8192), np.float32)
        for i, t in enumerate(b):
            for j in range(len(t) - 2):
                x[i, zlib.crc32(t[j:j + 3].encode()) % 8192] += 1
        return np.tanh(x @ proj)
    kind = "numpy hashing-embedding (fallback, not a neural model)"

state = {"done": 0, "active_s": 0.0}
if os.path.exists(OUT):
    try: state = {k: json.load(open(OUT))[k] for k in ("done", "active_s")}      # resume from checkpoint
    except Exception: pass

while state["done"] < TOTAL:
    t0 = time.process_time()                 # CPU time: does not advance while the process is paused
    embed(texts(BATCH))
    state["done"] += BATCH
    state["active_s"] += time.process_time() - t0
    tmp = OUT + ".tmp"
    json.dump({**state, "total": TOTAL, "kind": kind, "pid": os.getpid(),
               "items_per_cpu_s": state["done"] / max(state["active_s"], 1e-9), "updated": time.time()}, open(tmp, "w"))
    os.replace(tmp, OUT)
