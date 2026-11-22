"""The decision log: every live decision, append-only, each entry hashed onto the one before.

An entry is one tick of the live loop (live.py): what the loop read (`inputs`: the clock time, the
outdoor temperature, heat demand, the tank, the servers and the jobs), what it derived from them
(`signal`, `decision`, `placed`, `run`), its place in the log (`seq`) and the previous entry's
hash (`prev`). Its `hash` is SHA-256 of the entry's canonical JSON (sorted keys, no spaces) with
`prev` inside, so changing any past entry breaks its own hash and every link after it.

`verify` checks the links and the hashes, then hands each entry's inputs to `plan` (the same
decide() the yearly balance uses) and lists every place where the replay differs from the log.
"""
import hashlib
import json
import os
from pathlib import Path

GENESIS = "0" * 64
DERIVED = ("signal", "decision", "placed", "run")


def canonical(value) -> str:
    """The one JSON text an entry is hashed as: sorted keys, no spaces, no NaN."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def plain(value):
    """`value` as it reads back from JSON (tuples become lists), so a replay compares equal."""
    return json.loads(canonical(value))


def digest(entry: dict) -> str:
    """SHA-256 of an entry without its own hash."""
    return hashlib.sha256(canonical({k: v for k, v in entry.items() if k != "hash"}).encode()).hexdigest()


def seal(body: dict, seq: int, prev: str) -> dict:
    """The entry for `body` at `seq`, linked to `prev` and hashed."""
    entry = plain({**body, "seq": seq, "prev": prev})
    return {**entry, "hash": digest(entry)}


def read(path) -> list[dict]:
    """Every entry in a JSONL log, oldest first; an absent log is empty."""
    p = Path(path)
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text().splitlines() if line.strip()]


class Ledger:
    """An append-only JSONL log. Opening an existing log carries on its chain."""

    def __init__(self, path):
        self.path = Path(path)
        entries = read(self.path)
        self.seq = entries[-1]["seq"] + 1 if entries else 0
        self.prev = entries[-1]["hash"] if entries else GENESIS

    def append(self, body: dict) -> dict:
        entry = seal(body, self.seq, self.prev)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a") as f:
            f.write(canonical(entry) + "\n")
            f.flush()
            os.fsync(f.fileno())
        self.seq, self.prev = entry["seq"] + 1, entry["hash"]
        return entry


def chains(entries: list[dict]) -> list[list[dict]]:
    """Order entries read in any order (the database mirror) into chains, each from GENESIS.

    An entry no chain reaches, or two entries on the same link, end up in no chain; verify the
    file to find them.
    """
    after = {}
    for e in entries:
        after.setdefault(e["prev"], []).append(e)
    out = []
    for first in after.get(GENESIS, []):
        chain = [first]
        while len(after.get(chain[-1]["hash"], [])) == 1:
            chain.append(after[chain[-1]["hash"]][0])
        out.append(chain)
    return out


def verify(entries: list[dict], plan) -> list[str]:
    """Every mismatch in a chain: a broken link, a wrong hash, or a decision `plan` does not repeat.

    `plan(inputs)` returns the derived parts (signal, decision, placed, run). An empty list means
    the log is intact and every decision in it follows from its inputs.
    """
    problems = []
    prev = GENESIS
    for i, e in enumerate(entries):
        where = f"entry {e.get('seq', i)}"
        if e.get("seq") != i:
            problems.append(f"{where}: seq is {e.get('seq')}, expected {i}")
        if e.get("prev") != prev:
            problems.append(f"{where}: prev does not match the hash of the entry before")
        if e.get("hash") != digest(e):
            problems.append(f"{where}: hash does not match its contents")
        prev = e.get("hash", "")
        try:
            again = plain(plan(e["inputs"]))
        except Exception as err:  # a malformed entry is a finding, not a crash
            problems.append(f"{where}: its inputs do not replay ({err})")
            continue
        for part in DERIVED:
            if again[part] != e.get(part):
                problems.append(f"{where}: {part} is {canonical(e.get(part))}, the replay gives {canonical(again[part])}")
    return problems
