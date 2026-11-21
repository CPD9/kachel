import subprocess
import sys
from pathlib import Path

from kachel_agent.loop import follow, read_signal_file
from kachel_agent.process import Job, State


def test_signal_file_reads_run_and_pause(tmp_path: Path) -> None:
    path = tmp_path / "signal"
    read = read_signal_file(path)
    assert read() is False
    path.write_text("run\n")
    assert read() is True
    path.write_text("pause")
    assert read() is False


def test_follow_pauses_and_resumes_a_real_process_on_the_signal() -> None:
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    signals = iter([True, True, False, False, True])
    try:
        changes = follow(Job(child.pid), lambda: next(signals), sleep=lambda _: None)
        seen = [(c.tick, c.state) for c in (next(changes) for _ in range(3))]
    finally:
        child.kill()
        child.wait()
    assert seen == [(0, State.RUNNING), (2, State.PAUSED), (4, State.RUNNING)]


def test_follow_stops_when_the_job_is_gone() -> None:
    child = subprocess.Popen([sys.executable, "-c", "pass"])
    child.wait()
    changes = list(follow(Job(child.pid), lambda: True, sleep=lambda _: None))
    assert [c.state for c in changes] == [State.GONE]
