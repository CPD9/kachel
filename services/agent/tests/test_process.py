import subprocess
import sys
import time

import pytest

from kachel_agent.process import Job, State


def wait_for(job: Job, want: State, timeout: float = 2.0) -> State:
    end = time.monotonic() + timeout
    while (got := job.state()) is not want and time.monotonic() < end:
        time.sleep(0.01)
    return got


@pytest.fixture
def child():
    proc = subprocess.Popen([sys.executable, "-c", "import time\nwhile True: time.sleep(0.05)"])
    yield proc
    proc.kill()
    proc.wait()


def test_pauses_and_resumes_a_real_process(child):
    job = Job(child.pid)
    assert job.state() is State.RUNNING
    job.follow(run=False)
    assert wait_for(job, State.PAUSED) is State.PAUSED
    job.follow(run=True)
    assert wait_for(job, State.RUNNING) is State.RUNNING


def test_following_the_same_decision_twice_changes_nothing(child):
    job = Job(child.pid)
    job.follow(run=False)
    assert wait_for(job, State.PAUSED) is State.PAUSED
    assert job.follow(run=False) is State.PAUSED


def test_a_finished_job_is_gone(child):
    child.kill()
    child.wait()
    assert Job(child.pid).follow(run=True) is State.GONE
