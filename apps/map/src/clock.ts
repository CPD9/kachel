import { sunElevationDeg } from "./sun";

/**
 * The moment, on the day of `now`, a given number of minutes before the sun sets at a place.
 * Found by stepping through the afternoon in UTC, so it needs no time-zone tables.
 */
export function beforeSunset(now: Date, lat: number, lon: number, minutes: number): Date {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let previous = sunElevationDeg(new Date(day + 12 * 3_600_000), lat, lon);
  for (let m = 12 * 60 + 1; m < 24 * 60; m++) {
    const t = day + m * 60_000;
    const e = sunElevationDeg(new Date(t), lat, lon);
    if (previous > 0 && e <= 0) return new Date(t - minutes * 60_000);
    previous = e;
  }
  return new Date(day + 17 * 3_600_000);
}

const zurich = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "16:42" in Swiss local time. */
export function swissTime(when: Date): string {
  return zurich.format(when);
}

/** The local hour in Switzerland as a decimal, e.g. 16.7. */
export function swissHour(when: Date): number {
  const [h, m] = swissTime(when).split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}
