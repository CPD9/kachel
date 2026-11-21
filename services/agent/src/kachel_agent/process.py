"""Pause and resume a running job process on the heat signal.

The job keeps its memory while paused (SIGSTOP), so it carries on where it
stopped when heat is wanted again (SIGCONT). Processes are only ever addressed
by PID.
"""

from __future__ import annotations

import os
import signal
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class State(StrEnum):
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    GONE = "GONE"


@dataclass(frozen=True)
class Job:
    pid: int

    def state(self) -> State:
        """Read the process state from /proc: T (stopped) is paused."""
        try:
            stat = Path(f"/proc/{self.pid}/stat").read_text()
        except FileNotFoundError:
            return State.GONE
        code = stat.rsplit(")", 1)[1].split()[0]
        if code == "Z":
            return State.GONE
        return State.PAUSED if code in ("T", "t") else State.RUNNING

    def pause(self) -> None:
        os.kill(self.pid, signal.SIGSTOP)

    def resume(self) -> None:
        os.kill(self.pid, signal.SIGCONT)

    def follow(self, run: bool) -> State:
        """Bring the job to what the scheduler decided, and return its state after."""
        now = self.state()
        if now is State.GONE:
            return now
        if run and now is State.PAUSED:
            self.resume()
        elif not run and now is State.RUNNING:
            self.pause()
        return self.state()
