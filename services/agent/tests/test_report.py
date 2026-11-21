import json
import subprocess
import sys

import httpx
import pytest

from kachel_agent.loop import Change, follow
from kachel_agent.process import Job, State
from kachel_agent.report import MissingSetting, Reporter, client_from_env

JOB = "00000000-0000-4000-8000-000000000304"
SERVER = "00000000-0000-4000-8000-000000000204"


class FakeSupabase:
    """A fake REST layer: records each request and answers like PostgREST."""

    def __init__(self, status: int = 204) -> None:
        self.status = status
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status if request.method != "POST" else 201)

    def client(self, key: str = "sb_secret_local") -> httpx.Client:
        env = {"SUPABASE_URL": "http://127.0.0.1:54321/", "SUPABASE_SERVICE_ROLE_KEY": key}
        return client_from_env(env, transport=httpx.MockTransport(self))

    def writes(self) -> list[tuple[str, str, str, dict]]:
        return [
            (r.method, r.url.path, r.url.query.decode(), json.loads(r.content))
            for r in self.requests
        ]


def test_a_pause_writes_the_job_its_server_and_a_run() -> None:
    fake = FakeSupabase()
    report = Reporter(fake.client(), JOB, SERVER, pid=4104)
    assert report(Change(tick=3, run=False, state=State.PAUSED)) is True
    assert fake.writes() == [
        (
            "PATCH",
            "/rest/v1/jobs",
            f"id=eq.{JOB}",
            {"state": "PAUSED", "server_id": SERVER, "pid": 4104},
        ),
        ("PATCH", "/rest/v1/servers", f"id=eq.{SERVER}", {"state": "PAUSED"}),
        (
            "POST",
            "/rest/v1/job_runs",
            "",
            {
                "job_id": JOB,
                "server_id": SERVER,
                "tick": 3,
                "run": False,
                "state": "PAUSED",
                "reason": "tank full / no heat sink: backlog paused",
            },
        ),
    ]


def test_a_finished_job_turns_its_server_off() -> None:
    fake = FakeSupabase()
    Reporter(fake.client(), JOB, SERVER, pid=4104)(Change(tick=9, run=True, state=State.GONE))
    assert fake.writes()[1][3] == {"state": "OFF"}


def test_keys_go_in_the_right_headers() -> None:
    fake = FakeSupabase()
    Reporter(fake.client("sb_secret_local"), JOB, SERVER, 1)(Change(0, True, State.RUNNING))
    Reporter(fake.client("eyJlocal"), JOB, SERVER, 1)(Change(0, True, State.RUNNING))
    secret, jwt = fake.requests[0], fake.requests[3]
    assert secret.headers["apikey"] == "sb_secret_local"
    assert "authorization" not in secret.headers
    assert jwt.headers["authorization"] == "Bearer eyJlocal"


def test_a_failed_write_is_logged_and_the_agent_carries_on(capsys) -> None:
    fake = FakeSupabase(status=500)
    report = Reporter(fake.client(), JOB, SERVER, pid=1)
    assert report(Change(tick=1, run=True, state=State.RUNNING)) is False
    assert "could not report to Supabase" in capsys.readouterr().err


def test_settings_come_from_the_environment() -> None:
    with pytest.raises(MissingSetting, match=r"\.env\.example"):
        client_from_env({"SUPABASE_URL": "http://127.0.0.1:54321"})


def test_the_real_loop_reports_pause_and_resume() -> None:
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    signals = iter([True, False, True])
    fake = FakeSupabase()
    report = Reporter(fake.client(), JOB, SERVER, pid=child.pid)
    try:
        changes = follow(Job(child.pid), lambda: next(signals), sleep=lambda _: None)
        for change in (next(changes) for _ in range(3)):
            report(change)
    finally:
        child.kill()
        child.wait()
    jobs = [body["state"] for method, path, _, body in fake.writes() if path == "/rest/v1/jobs"]
    assert jobs == ["RUNNING", "PAUSED", "RUNNING"]
