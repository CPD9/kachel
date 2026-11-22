"""Bake the live loop's decision log into the small JSON the console replays on Vercel.

  python3 apps/operator/scripts/bake_replay.py services/scheduler/out/decisions.jsonl

The log is what `make live-demo` wrote (services/scheduler/live.py): 13 January and 15 July on the
reference house, hash-chained. Every entry's hash and link are checked with the scheduler's own
ledger before anything is written; the JSON keeps only what the console shows.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services" / "scheduler"))
from heatsched.ledger import GENESIS, digest, read  # noqa: E402

OUT = ROOT / "apps" / "operator" / "src" / "replay" / "decisions.json"


def main(log: str) -> None:
    entries = read(log)
    prev = GENESIS
    for e in entries:
        if e["prev"] != prev or digest(e) != e["hash"]:
            sys.exit(f"The log's chain breaks at seq {e['seq']}: not baked.")
        prev = e["hash"]
    slim = []
    for e in entries:
        i, d = e["inputs"], e["decision"]
        slim.append({
            "seq": e["seq"], "hash": e["hash"], "prev": e["prev"], "at": e["at"],
            "time": i["time"], "temp_c": i["temp_c"], "demand_kwh": round(i["demand_kwh"], 2),
            "soc_kwh": round(i["soc_kwh"], 2), "tank_kwh": i["tank_kwh"], "servers": len(i["servers"]),
            "interactive": d["interactive"], "batch": d["batch"], "opportunistic": d["opportunistic"],
            "reason": d["reason"],
            "jobs": [{"id": j["id"], "kind": j["kind"], "server": j["server"]} for j in i["jobs"]],
            "queue": [{"id": q["id"], "kind": q["kind"]} for q in i["queue"]],
            "run": e["run"],
            "placed": e["placed"],
        })
    OUT.write_text(json.dumps({"source": "services/scheduler/live.py (make live-demo), out/decisions.jsonl",
                               "site": entries[0]["inputs"]["site"], "entries": slim}, indent=1) + "\n")
    print(f"{len(slim)} decisions, chain intact, to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1])
