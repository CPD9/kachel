/** Web Mercator, as the swisstopo tiles use (EPSG:3857): world pixels at a zoom level. */
export const TILE = 256;

export function world(lat: number, lon: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
  };
}

export type Point = { lat: number; lon: number };

/** A box on screen showing some points: the zoom that fits them all, and where each one lands. */
export interface Frame {
  zoom: number;
  /** World pixel at the box's top-left corner, at `zoom`. */
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/** The largest zoom (in quarter steps, at most 15) that fits every point with `pad` px around. */
export function fit(points: Point[], width: number, height: number, pad = 40): Frame {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const box = {
    n: Math.max(...lats),
    s: Math.min(...lats),
    e: Math.max(...lons),
    w: Math.min(...lons),
  };
  let zoom = 15;
  for (; zoom > 8; zoom -= 0.25) {
    const a = world(box.n, box.w, zoom);
    const b = world(box.s, box.e, zoom);
    if (b.x - a.x <= width - 2 * pad && b.y - a.y <= height - 2 * pad) break;
  }
  const c = world((box.n + box.s) / 2, (box.e + box.w) / 2, zoom);
  return { zoom, x0: c.x - width / 2, y0: c.y - height / 2, width, height };
}

/** Where a point lands in the box, in px from its top-left corner. */
export function place(frame: Frame, p: Point) {
  const w = world(p.lat, p.lon, frame.zoom);
  return { x: w.x - frame.x0, y: w.y - frame.y0 };
}

/** The tiles that cover the box, fetched at the zoom above and drawn scaled down, so they stay sharp. */
export function tiles(frame: Frame) {
  const z = Math.min(18, Math.ceil(frame.zoom));
  const scale = 2 ** (frame.zoom - z);
  const size = TILE * scale;
  const out: { z: number; x: number; y: number; left: number; top: number; size: number }[] = [];
  const first = { x: Math.floor(frame.x0 / size), y: Math.floor(frame.y0 / size) };
  const last = {
    x: Math.floor((frame.x0 + frame.width) / size),
    y: Math.floor((frame.y0 + frame.height) / size),
  };
  for (let x = first.x; x <= last.x; x++) {
    for (let y = first.y; y <= last.y; y++) {
      out.push({ z, x, y, left: x * size - frame.x0, top: y * size - frame.y0, size });
    }
  }
  return out;
}

/** swisstopo's grey national map (free to use with the credit "© swisstopo"). */
export const tileUrl = (t: { z: number; x: number; y: number }) =>
  `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/${t.z}/${t.x}/${t.y}.jpeg`;
