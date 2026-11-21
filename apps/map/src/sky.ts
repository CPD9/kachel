/**
 * The sky behind the globe: from a pink-violet dusk with a blue band over the horizon (like the
 * Blender skyline render) to a deep night blue.
 */
export function duskSky(night: number): string {
  const t = Math.min(1, Math.max(0, (night - 0.2) / 0.8));
  const mix = (a: readonly number[], b: readonly number[]) =>
    `rgb(${a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * t)).join(",")})`;
  const top = mix([142, 128, 160], [12, 16, 34]);
  const middle = mix([196, 132, 160], [22, 30, 58]);
  const horizon = mix([44, 98, 160], [30, 44, 78]);
  return `linear-gradient(to bottom, ${top} 0%, ${middle} 22%, ${horizon} 36%, ${horizon} 100%)`;
}
