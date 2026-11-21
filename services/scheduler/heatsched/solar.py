"""Roof PV and a home battery for the servers (issue #27).

PV output per hour comes from the weather file's global horizontal irradiance:
  1. Sun position for the middle of each hour (Spencer 1971 declination and equation of time).
  2. Split into direct and diffuse light with the Erbs, Klein and Duffie (1982) correlation.
  3. Turn onto the tilted roof with the isotropic-sky model (Liu and Jordan 1963).
  4. kWh per kWp = irradiance on the roof (kW/m²) × performance ratio. The ratio in config.json
     is PVGIS's total loss for Basel (JRC PVGIS 5.3), so it covers heat, cables and inverter.

The battery and the PV serve the servers only. The rest of the house is left out on purpose,
so "share of server power from own PV" means exactly that.
"""
import numpy as np
import pandas as pd

SOLAR_CONSTANT = 1367.0                     # W/m²


def sun(times, lat, lon, utc_offset_h):
    """cos(zenith), sun azimuth (radians, 0 = south, west positive) and extraterrestrial W/m² per timestamp.

    `times` are the weather file's labels. Open-Meteo gives the mean of the hour that ends at the label,
    so the sun is placed half an hour earlier. The 2025 file has 8,760 rows with no summer-time jump,
    so its labels are taken as a fixed UTC offset.
    """
    t = pd.to_datetime(pd.Series(times)) - pd.Timedelta(minutes=30)
    doy = t.dt.day_of_year.values
    g = 2 * np.pi * (doy - 1) / 365
    decl = (0.006918 - 0.399912 * np.cos(g) + 0.070257 * np.sin(g) - 0.006758 * np.cos(2 * g)
            + 0.000907 * np.sin(2 * g) - 0.002697 * np.cos(3 * g) + 0.00148 * np.sin(3 * g))
    eot_min = 229.18 * (0.000075 + 0.001868 * np.cos(g) - 0.032077 * np.sin(g)
                        - 0.014615 * np.cos(2 * g) - 0.040849 * np.sin(2 * g))
    clock_h = t.dt.hour.values + t.dt.minute.values / 60
    solar_h = clock_h - utc_offset_h + lon / 15 + eot_min / 60
    w = np.radians(15 * (solar_h - 12))                 # hour angle
    phi = np.radians(lat)
    cosz = np.sin(phi) * np.sin(decl) + np.cos(phi) * np.cos(decl) * np.cos(w)
    sinz = np.sqrt(np.clip(1 - cosz**2, 0, 1))
    az = np.arctan2(np.cos(decl) * np.sin(w), np.cos(decl) * np.cos(w) * np.sin(phi) - np.sin(decl) * np.cos(phi))
    extra = SOLAR_CONSTANT * (1 + 0.033 * np.cos(2 * np.pi * doy / 365))
    return cosz, sinz, az, extra


def erbs_diffuse_fraction(kt):
    """Erbs, Klein and Duffie (1982): diffuse share of global horizontal light from the clearness index."""
    return np.where(kt <= 0.22, 1 - 0.09 * kt,
                    np.where(kt <= 0.8, 0.9511 - 0.1604 * kt + 4.388 * kt**2 - 16.638 * kt**3 + 12.336 * kt**4, 0.165))


def roof_irradiance(weather, s):
    """W/m² on the tilted roof for each hour of the weather file."""
    ghi = weather["solar_wm2"].to_numpy(dtype=float)
    cosz, sinz, az, extra = sun(weather["time"], s["latitude"], s["longitude"], s["utc_offset_h"])
    up = cosz > 0.065                                   # sun more than about 3.7° up; below that, diffuse only
    kt = np.where(up, np.clip(ghi / np.maximum(extra * cosz, 1e-6), 0, 1), 0.0)
    dhi = np.where(up, ghi * erbs_diffuse_fraction(kt), ghi)
    dni_h = ghi - dhi                                   # direct light on a horizontal surface
    beta, gamma = np.radians(s["tilt_deg"]), np.radians(s["azimuth_deg"])
    cos_aoi = cosz * np.cos(beta) + sinz * np.sin(beta) * np.cos(az - gamma)
    beam = np.where(up, dni_h * np.clip(cos_aoi, 0, None) / np.maximum(cosz, 0.065), 0.0)
    return beam + dhi * (1 + np.cos(beta)) / 2 + ghi * s["ground_albedo"] * (1 - np.cos(beta)) / 2


def pv_kwh(weather, s):
    """kWh the roof makes in each hour: kWp × roof irradiance (kW/m²) × performance ratio."""
    return s["roof_kwp"] * roof_irradiance(weather, s) / 1000 * s["performance_ratio"]


def own_power(load_kwh, pv, battery_kwh, round_trip):
    """Hour by hour: PV first powers the servers, the surplus charges the battery, the rest is sold.

    Returns a DataFrame with pv_direct, from_battery, from_grid, exported and battery_soc (all kWh).
    Losses are split evenly between charging and discharging.
    """
    eta = np.sqrt(round_trip)
    soc, rows = 0.0, []
    for load, sun_kwh in zip(np.asarray(load_kwh, float), np.asarray(pv, float), strict=True):
        direct = min(load, sun_kwh)
        surplus = sun_kwh - direct
        charge = min(surplus, (battery_kwh - soc) / eta) if battery_kwh else 0.0
        soc += charge * eta
        out = min(load - direct, soc * eta)
        soc -= out / eta
        rows.append((direct, out, load - direct - out, surplus - charge, soc))
    return pd.DataFrame(rows, columns=["pv_direct", "from_battery", "from_grid", "exported", "battery_soc"])
