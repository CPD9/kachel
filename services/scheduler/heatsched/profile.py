"""Reference-house hourly profile: weather -> heating demand + hot water (kWh per hour)."""
import io, urllib.request
import numpy as np, pandas as pd

URL = ("https://archive-api.open-meteo.com/v1/archive?latitude=47.56&longitude=7.59"
       "&start_date=2025-01-01&end_date=2025-12-31&hourly=temperature_2m,shortwave_radiation"
       "&timezone=Europe%2FZurich&format=csv")

def download_weather(path="out/weather_basel_2025.csv"):
    raw = urllib.request.urlopen(URL, timeout=60).read().decode()
    body = raw[raw.index("time,"):]                      # skip Open-Meteo's metadata header
    df = pd.read_csv(io.StringIO(body))
    df.columns = ["time", "temp_c", "solar_wm2"]
    df.to_csv(path, index=False)
    return df

def synthetic_weather(seed=7):
    """Stand-in ONLY for offline testing. Tuned to the brief's totals, not real weather."""
    rng = np.random.default_rng(seed)
    t = pd.date_range("2025-01-01", "2025-12-31 23:00", freq="h")
    doy, hr = t.dayofyear.values, t.hour.values
    season = np.cos(2 * np.pi * (doy - 200) / 365)
    noise = np.zeros(len(t))
    for i in range(1, len(t)):
        noise[i] = 0.985 * noise[i - 1] + rng.normal(0, 0.52)
    temp = 12.0 + 9.3 * season + (2.2 + 1.8 * (season + 1) / 2) * np.cos(2 * np.pi * (hr - 15) / 24) + noise
    temp = np.maximum(temp, -5.6)
    solar = np.maximum(0, np.sin(np.pi * (hr - 6) / 12)) * (350 + 350 * (season + 1) / 2)
    return pd.DataFrame({"time": t.astype(str), "temp_c": temp.round(1), "solar_wm2": solar.round(0)})

def build_profile(weather, cfg):
    """Apply the brief's formula. Returns one row per local hour of 2025."""
    df = weather.copy()
    df["time"] = pd.to_datetime(df["time"])
    df["date"] = df["time"].dt.date
    df["hour"] = df["time"].dt.hour
    daily_mean = df.groupby("date")["temp_c"].transform("mean")
    df["heating_day"] = daily_mean < 12.0
    df["heat_kwh"] = np.where(df["heating_day"], np.maximum(0, 10 * (20 - df["temp_c"]) / 25.6), 0.0)
    dhw = cfg["house"]["hot_water_kwh_per_day"]
    df["dhw_kwh"] = dhw / df.groupby("date")["hour"].transform("count")      # flat; DST-safe
    df["demand_kwh"] = df["heat_kwh"] + df["dhw_kwh"]
    return df.reset_index(drop=True)

def load_case_profile(path, cfg):
    """Use the CSV shipped with the case. Column names are guessed; check the printout."""
    raw = pd.read_csv(path)
    def find(*keys):
        return next((c for c in raw.columns if any(k in c.lower() for k in keys)), None)
    cols = {"time": find("time", "date"), "temp": find("temp"),
            "heat": find("heating", "space", "heat_"), "dhw": find("water", "dhw"),
            "solar": find("rad", "solar", "irr")}
    print("case CSV columns mapped:", cols)
    df = pd.DataFrame({"time": pd.to_datetime(raw[cols["time"]]), "temp_c": raw[cols["temp"]],
                       "heat_kwh": raw[cols["heat"]], "dhw_kwh": raw[cols["dhw"]]})
    df["solar_wm2"] = raw[cols["solar"]] if cols["solar"] else 0
    df["date"], df["hour"] = df["time"].dt.date, df["time"].dt.hour
    df["heating_day"] = df.groupby("date")["heat_kwh"].transform("sum") > 0
    df["demand_kwh"] = df["heat_kwh"] + df["dhw_kwh"]
    return df
