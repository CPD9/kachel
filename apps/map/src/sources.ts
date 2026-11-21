/**
 * Every outside service the map reads, in one place. All are open services used as their
 * publishers intend: streamed from their own servers, nothing copied into this repo.
 * Terms and documentation are listed in apps/map/README.md.
 */

/** swissBUILDINGS3D as 3D Tiles, streamed from swisstopo (docs.geo.admin.ch, "3D Tiles"). */
export const SWISS_BUILDINGS =
  "https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json";

/** swisstopo terrain as quantized mesh (docs.geo.admin.ch, "Terrain service"). */
export const SWISS_TERRAIN = "https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/";

/** SWISSIMAGE aerial photographs, WMTS in Web Mercator. */
export const SWISS_IMAGE =
  "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg";

/** Canton areas from swissBOUNDARIES3D (data status 01.01.2026), WMTS in Web Mercator. */
export const SWISS_CANTONS =
  "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissboundaries3d-kanton-flaeche.fill/default/current/3857/{z}/{x}/{y}.png";

/** OpenStreetMap's standard tiles, for everywhere outside Switzerland. */
export const OSM_TILES = "https://tile.openstreetmap.org/";

/** Switzerland's bounding box in degrees (west, south, east, north), where swisstopo data applies. */
export const SWITZERLAND = { west: 5.95, south: 45.81, east: 10.5, north: 47.81 } as const;

/** The credits shown on screen at all times. */
export const CREDITS = [
  { label: "© swisstopo", href: "https://www.geo.admin.ch/en/general-terms-of-use-fsdi" },
  {
    label: "© OpenStreetMap contributors (ODbL)",
    href: "https://www.openstreetmap.org/copyright",
  },
  { label: "CesiumJS (Apache-2.0)", href: "https://cesium.com/platform/cesiumjs/" },
] as const;
