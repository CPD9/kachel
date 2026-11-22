"""Follow the heat signal every tick: run the job while its heat is wanted, pause it otherwise.

The signal is whatever decides; here it is read from a file whose first line is "run" or
"pause", so the scheduler's live loop (services/scheduler/live.py) can steer a real process
without touching it. The loop puts its reason and the decision's hash on the lines after.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

from .process import Job, State


@dataclass(frozen=True)
class Change:
    tick: int
    run: bool
    state: State


def _lines(path: Path) -> list[str]:
    try:
        return path.read_text().strip().splitlines()
    except FileNotFoundError:
        return []


def read_signal_file(path: Path) -> Callable[[], bool]:
    """A signal that is True while the file's first line says "run". A missing file means pause."""

    def read() -> bool:
        lines = _lines(path)
        return bool(lines) and lines[0].strip().lower() == "run"

    return read


@dataclass(frozen=True)
class Note:
    """Why the signal says what it says, when the scheduler wrote it: its reason and hash."""

    reason: str
    decision: str | None = None


def read_note(path: Path) -> Note | None:
    """The lines after run/pause, or None when the file holds the signal alone (by hand)."""
    rest = [line.strip() for line in _lines(path)[1:] if line.strip()]
    if not rest:
        return None
    return Note(rest[0], rest[1] if len(rest) > 1 else None)


def follow(
    job: Job,
    signal: Callable[[], bool],
    tick_s: float = 1.0,
    sleep: Callable[[float], None] = time.sleep,
) -> Iterator[Change]:
    """Yield a Change each time the job's state changes, until the job is gone."""
    last: State | None = None
    tick = 0
    while True:
        run = signal()
        state = job.follow(run)
        if state != last:
            yield Change(tick, run, state)
            last = state
        if state is State.GONE:
            return
        tick += 1
        sleep(tick_s)
