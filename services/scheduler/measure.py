"""Must-have 1: run the real job for a while, measure it, scale it to the 1 kW reference server.

  python measure.py --seconds 60 --device-watts 30

Energy = active CPU seconds x device power (state where the watts come from: charger rating,
powermetrics, RAPL, a plug meter). Scaling: same energy per item on the reference server,
i.e. equal performance per watt. That is an assumption; MLPerf power results can replace it.
"""
import argparse, json, time
from heatsched.realjob import RealJob

ap = argparse.ArgumentParser()
ap.add_argument("--seconds", type=float, default=60)
ap.add_argument("--device-watts", type=float, default=30.0)
ap.add_argument("--items-per-job", type=int, default=10000)
a = ap.parse_args()
job = RealJob(); time.sleep(a.seconds); st = job.status(); job.stop()
s_per_job = a.items_per_job / st["items_per_cpu_s"]
wh_per_job = s_per_job * a.device_watts / 3600
m = {"workload": st["kind"], "items_measured": st["done"], "active_cpu_s": round(st["active_s"], 2),
     "items_per_s_on_this_device": round(st["items_per_cpu_s"], 1), "device_watts_assumed": a.device_watts,
     "items_per_job": a.items_per_job, "runtime_per_job_s_on_this_device": round(s_per_job, 1),
     "energy_per_job_wh": round(wh_per_job, 3),
     "jobs_per_reference_server_hour": round(1000 / wh_per_job, 1),
     "runtime_per_job_s_on_reference_server": round(3600 * wh_per_job / 1000, 2),
     "scaling_rule": "equal energy per item on the 1 kW reference server (equal performance per watt)"}
json.dump(m, open("out/measurements.json", "w"), indent=2); print(json.dumps(m, indent=2))
