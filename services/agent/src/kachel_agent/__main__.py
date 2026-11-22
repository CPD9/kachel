"""Run the agent on one job: python -m kachel_agent --pid <pid> --signal <file>.

The signal file's first line is "run" or "pause". The scheduler's live loop writes it (make live);
a person can too.

With --job-id and --server-id it also writes each change to Supabase, reading SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY from the environment (services/agent/.env.example).
"""

from __future__ import annotations

import argparse
from contextlib import ExitStack
from pathlib import Path

from .loop import follow, read_note, read_signal_file
from .process import Job
from .report import Reporter, client_from_env


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True, help="the job process, by PID only")
    parser.add_argument(
        "--signal", type=Path, required=True, help='file whose first line is "run" or "pause"'
    )
    parser.add_argument("--tick", type=float, default=1.0, help="seconds between checks")
    parser.add_argument("--job-id", help="the job's row in Supabase (jobs.id)")
    parser.add_argument("--server-id", help="the server's row in Supabase (servers.id)")
    args = parser.parse_args()
    if (args.job_id is None) != (args.server_id is None):
        parser.error("--job-id and --server-id go together")
    with ExitStack() as stack:
        report = None
        if args.job_id:
            http = stack.enter_context(client_from_env())
            report = Reporter(http, args.job_id, args.server_id, args.pid)
        for change in follow(Job(args.pid), read_signal_file(args.signal), args.tick):
            note = read_note(args.signal)
            signal = "run" if change.run else "pause"
            why = f" ({note.reason})" if note else ""
            print(f"tick {change.tick}: signal {signal} -> {change.state}{why}", flush=True)
            if report is not None:
                report(change, note)


if __name__ == "__main__":
    main()
