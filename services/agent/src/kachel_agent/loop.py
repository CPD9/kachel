"""Follow the heat signal every tick: run the job while its heat is wanted, pause it otherwise.

The signal is whatever decides; here it is read from a file holding "run" or "pause",
so the scheduler (or a person in a demo) can steer a real process without touching it.
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


def read_signal_file(path: Path) -> Callable[[], bool]:
    """A signal that is True while the file says "run". A missing file means pause."""

    def read() -> bool:
        try:
            return path.read_text().strip().lower() == "run"
        except FileNotFoundError:
            return False

    return read


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
