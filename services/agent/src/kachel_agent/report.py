"""Write each change the agent makes to Supabase, so the apps see a job pause and resume.

The agent talks to the Supabase REST API (PostgREST) with the service role or secret key,
read from the environment only. A failed write is logged and the loop carries on: the heat
signal matters more than the screen.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Mapping
from dataclasses import dataclass

import httpx

from .loop import Change, Note
from .process import State

# What the house view shows as the reason when the signal file holds run or pause alone, as when a
# person writes it (supabase/seed.sql writes the same). The agent never sees the tank, so it does
# not guess why. When the scheduler's live loop writes the file, its own reason and the hash of
# the logged decision are used instead (see `reason`).
REASONS = {
    State.RUNNING: "running on its signal file (demo switch)",
    State.PAUSED: "paused by its signal file (demo switch, not the tank)",
    State.GONE: "job ended",
}

# A server holds its job while paused and is off once the job is gone.
SERVER_STATES = {State.RUNNING: "RUNNING", State.PAUSED: "PAUSED", State.GONE: "OFF"}


class MissingSetting(RuntimeError):
    pass


def reason(state: State, note: Note | None) -> str:
    """The job_runs reason: the scheduler's own words and decision hash, or the plain signal."""
    if note is None or state is State.GONE:
        return REASONS[state]
    verb = "running" if state is State.RUNNING else "paused"
    where = f" (decision {note.decision[:12]})" if note.decision else ""
    return f"{verb} by the scheduler: {note.reason}{where}"


def client_from_env(
    env: Mapping[str, str] = os.environ, transport: httpx.BaseTransport | None = None
) -> httpx.Client:
    """An HTTP client for the Supabase REST API, from SUPABASE_URL and the service role key.

    Tests pass a fake transport; the agent uses the real network.
    """
    url = env.get("SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise MissingSetting(
            "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing: see services/agent/.env.example"
        )
    headers = {"apikey": key, "Prefer": "return=minimal"}
    # Legacy service role keys are JWTs and go in Authorization too; sb_secret_ keys do not.
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    return httpx.Client(
        base_url=f"{url}/rest/v1", headers=headers, timeout=5.0, transport=transport
    )


@dataclass
class Reporter:
    """Writes the job's state, its server's state and a job_runs row for each Change."""

    http: httpx.Client
    job_id: str
    server_id: str
    pid: int

    def __call__(self, change: Change, note: Note | None = None) -> bool:
        try:
            self._write(change, note)
        except httpx.HTTPError as err:
            print(f"tick {change.tick}: could not report to Supabase: {err}", file=sys.stderr)
            return False
        return True

    def _write(self, change: Change, note: Note | None = None) -> None:
        job = {"state": str(change.state), "server_id": self.server_id, "pid": self.pid}
        self.http.patch("/jobs", params={"id": f"eq.{self.job_id}"}, json=job).raise_for_status()
        self.http.patch(
            "/servers",
            params={"id": f"eq.{self.server_id}"},
            json={"state": SERVER_STATES[change.state]},
        ).raise_for_status()
        run = {
            "job_id": self.job_id,
            "server_id": self.server_id,
            "tick": change.tick,
            "run": change.run,
            "state": str(change.state),
            "reason": reason(change.state, note),
        }
        self.http.post("/job_runs", json=run).raise_for_status()
