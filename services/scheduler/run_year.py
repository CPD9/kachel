"""Must-have 3: the yearly balance for the reference house.

  python run_year.py                  # downloads Basel 2025 from Open-Meteo
  python run_year.py --profile case.csv   # use the CSV shipped with the case (preferred)
  python run_year.py --weather tests/data/weather_basel_2025.csv   # Basel 2025, saved (make year)
  python run_year.py --servers 6      # force a server count instead of the recommended one
"""
import argparse, json, os
from heatsched import profile as P
from heatsched.sim import House, kpis, sweep, recommend
from heatsched.plots import make_all

ap = argparse.ArgumentParser()
ap.add_argument("--profile"); ap.add_argument("--weather"); ap.add_argument("--synthetic", action="store_true")
ap.add_argument("--servers", type=int); ap.add_argument("--config", default="config.json")
a = ap.parse_args()
cfg = json.load(open(a.config)); os.makedirs("out", exist_ok=True)

if a.profile: prof, src = P.load_case_profile(a.profile, cfg), "case CSV"
elif a.weather: prof, src = P.build_profile(P.load_weather(a.weather), cfg), P.weather_source(a.weather)
elif a.synthetic: prof, src = P.build_profile(P.synthetic_weather(), cfg), "SYNTHETIC weather (offline test only)"
else: prof, src = P.build_profile(P.download_weather(), cfg), "Open-Meteo archive, Basel 2025"
hd = int(prof.groupby("date")["heating_day"].first().sum())
print(f"profile: {src} | heating {prof.heat_kwh.sum():,.0f} kWh on {hd} heating days | "
      f"hot water {prof.dhw_kwh.sum():,.0f} kWh | coldest hour {prof.temp_c.min()} C")

sw = sweep(prof, cfg); sw.to_csv("out/sweep.csv", index=False)
n = a.servers or recommend(sw)
df = House(prof, cfg, n).run(); df.to_csv("out/hourly.csv", index=False)
k = kpis(df, cfg, n); k["profile_source"] = src; k["heating_days"] = hd
be = k["break_even_chf_per_server_hour"]
k["does_not_pay_off_when"] = (f"compute earns less than CHF {be:.2f} per server-hour" if be is not None
                              else "no server-hours are sold")
for name, date in P.showcase_days(prof).items():
    d = df[df["time"].str.startswith(date)].copy()
    d.insert(2, "hour", d["time"].str[11:13].astype(int))   # 0 to 23, for the animation's frames
    d.to_csv(f"out/day_{name}.csv", index=False)
open("out/kpis.json", "w").write(json.dumps(k, indent=2) + "\n")
print(sw[["servers_per_house", "share_of_heat_covered_pct", "heat_dumped_kwh", "utilisation_pct",
          "marginal_server_utilisation_pct", "break_even_chf_per_server_hour"]].to_string(index=False))
print(json.dumps(k, indent=2))
make_all(prof, sw, df, k, cfg, synthetic=a.synthetic)
print("plots, hourly.csv, day_january.csv, day_july.csv and kpis.json written to out/")
