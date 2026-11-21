"""Lets the scheduler hold a real OS process: start, pause (SIGSTOP), resume (SIGCONT), stop."""
import json, os, signal, subprocess, sys

class RealJob:
    def __init__(self, script="jobs/embed_job.py", progress="out/job_progress.json", fresh=True):
        self.progress = progress
        if fresh and os.path.exists(progress): os.remove(progress)
        self.proc = subprocess.Popen([sys.executable, script, progress])
        self.paused = False

    def set_running(self, run: bool):
        """Called with the scheduler's decision. Returns 'paused'/'resumed'/None."""
        if run and self.paused:
            self._sig(signal.SIGCONT if os.name != "nt" else None, "resume"); self.paused = False; return "resumed"
        if not run and not self.paused:
            self._sig(signal.SIGSTOP if os.name != "nt" else None, "suspend"); self.paused = True; return "paused"

    def _sig(self, sig, win_action):
        if sig is not None: os.kill(self.proc.pid, sig)
        else:
            import psutil                                   # Windows: pip install psutil
            getattr(psutil.Process(self.proc.pid), win_action)()

    def status(self):
        try: return json.load(open(self.progress))
        except Exception: return {"done": 0, "active_s": 0.0, "kind": "starting"}

    def stop(self):
        if self.paused: self.set_running(True)
        self.proc.terminate()
