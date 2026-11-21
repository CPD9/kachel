"""Run the agent on one job: python -m kachel_agent --pid <pid> --signal <file>."""

from __future__ import annotations

import argparse
from pathlib import Path

from .loop import follow, read_signal_file
from .process import Job


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True, help="the job process, by PID only")
    parser.add_argument("--signal", type=Path, required=True, help='file holding "run" or "pause"')
    parser.add_argument("--tick", type=float, default=1.0, help="seconds between checks")
    args = parser.parse_args()
    for change in follow(Job(args.pid), read_signal_file(args.signal), args.tick):
        print(
            f"tick {change.tick}: signal {'run' if change.run else 'pause'} -> {change.state}",
            flush=True,
        )


if __name__ == "__main__":
    main()
