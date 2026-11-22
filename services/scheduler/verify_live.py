"""Replay the live loop's decision log and report every mismatch (make verify-live).

  python verify_live.py                       # out/decisions.jsonl
  python verify_live.py --log some/other.jsonl
  python verify_live.py --db                  # the decisions table, every chain in it

For each entry it checks the link to the entry before, recomputes the SHA-256 hash, and hands
the logged inputs to the same plan() and decide() the loop ran: the placements, the Signal, the
decision and the jobs it ran must all come out the same. Exit status 1 on any mismatch.
--db reads with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment.
"""
import argparse
import json
import os
import sys

from heatsched.ledger import chains, read, verify
from heatsched.live import plan

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--log", default="out/decisions.jsonl")
ap.add_argument("--db", action="store_true", help="verify the decisions table instead of the file")
a = ap.parse_args()

if a.db:
    from heatsched.live_db import Supabase
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (services/agent/.env).")
    entries = [json.loads(text) for text in Supabase(url, key).decisions()]
    logs = chains(entries)
    where = f"the decisions table ({len(entries)} rows, {len(logs)} chains)"
    stray = len(entries) - sum(len(c) for c in logs)
else:
    entries = read(a.log)
    logs, where, stray = [entries], a.log, 0

if not entries:
    sys.exit(f"{where}: no decisions yet. Run make live first.")

problems = [p for log in logs for p in verify(log, plan)]
if stray:
    problems.append(f"{stray} rows are on no chain from the first entry: a link is missing or forked")
for p in problems:
    print(p)
last = entries[-1]
print(f"{where}: {len(entries)} decisions replayed through decide(), "
      f"{'no mismatch' if not problems else f'{len(problems)} mismatches'}; "
      f"last hash {last['hash'] if not a.db else logs[-1][-1]['hash'] if logs else '-'}")
sys.exit(1 if problems else 0)
