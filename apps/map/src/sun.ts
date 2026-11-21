/**
 * The sun's height above the horizon, in degrees, for a time and a place.
 * NOAA's low-precision formulas (good to about a tenth of a degree), enough to say how dark it is.
 */
export function sunElevationDeg(when: Date, latDeg: number, lonDeg: number): number {
  const rad = Math.PI / 180;
  const day = when.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545; // days since J2000.0
  const meanLon = (280.46 + 0.985_647_4 * day) % 360;
  const meanAnomaly = ((357.528 + 0.985_600_3 * day) % 360) * rad;
  const eclipticLon =
    (meanLon + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * rad;
  const obliquity = (23.439 - 0.000_000_4 * day) * rad;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLon),
    Math.cos(eclipticLon),
  );
  const siderealDeg = (280.460_618_37 + 360.985_647_366_29 * day + lonDeg) % 360;
  const hourAngle = siderealDeg * rad - rightAscension;
  const lat = latDeg * rad;
  const sinElevation =
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(sinElevation) / rad;
}

/**
 * How much of the city's lighting is on, from 0 (full daylight) to 1 (night).
 * Lights come on through civil twilight: sun from +2° down to −6°.
 */
export function nightFactor(sunElevation: number): number {
  const t = (2 - sunElevation) / 8;
  return Math.min(1, Math.max(0, t));
}

/**
 * Share of windows lit at a local hour: most in the evening, few after midnight, some at dawn.
 * Our illustration of a lived-in city, not data.
 */
export function windowsLitShare(localHour: number): number {
  const h = ((localHour % 24) + 24) % 24;
  if (h >= 16 && h < 22) return 0.55;
  if (h >= 22) return 0.55 - ((h - 22) / 2) * 0.35;
  if (h < 5) return 0.15;
  if (h < 8) return 0.15 + ((h - 5) / 3) * 0.25;
  return 0.3;
}
