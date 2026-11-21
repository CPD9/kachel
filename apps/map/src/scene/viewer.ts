import {
  Cartesian3,
  Cesium3DTile,
  Cesium3DTileFeature,
  Cesium3DTileset,
  Color,
  CesiumTerrainProvider,
  ClockRange,
  Credit,
  type Entity,
  HeightReference,
  EllipsoidTerrainProvider,
  ImageryLayer,
  JulianDate,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  PolylineCollection,
  Material,
  Cartesian2,
  Rectangle,
  SunLight,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
  WebMercatorTilingScheme,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Picked } from "../building/geoadmin";
import type { Area, Network } from "../networks/thermal";
import { beforeSunset, swissHour } from "../clock";
import { BASEL, CANTONS_FROM_M, ORIGIN, type View } from "../views";
import { OSM_TILES, SWISS_BUILDINGS, SWISS_IMAGE, SWISS_TERRAIN, SWITZERLAND } from "../sources";
import { duskSky } from "../sky";
import { nightFactor, sunElevationDeg, windowsLitShare } from "../sun";
import { loadCantons } from "./cantons";
import { homeServerLayer, networkLayer } from "./layers";
import { originFrame, updateWindows, windowShader } from "./windows";

/** Simulated seconds per real second: a whole day passes in about five minutes. */
export const DAY_SPEED = 300;

/** What a click hit: a building, a thermal network, or nothing of ours. */
export type Pick =
  | { readonly kind: "building"; readonly building: Picked }
  | { readonly kind: "network"; readonly network: Network }
  | null;

/** What the page needs from the 3D scene; tests pass a fake. */
export interface Scene {
  /** The simulated time on the map. */
  time(): Date;
  playing(): boolean;
  setPlaying(on: boolean): void;
  /** Flies to a view; resolves when the flight ends or is cancelled. */
  flyTo(view: View, seconds?: number): Promise<void>;
  /** Resolves once the buildings and the ground in view have loaded. */
  tilesLoaded(): Promise<void>;
  /** Moves the map's clock to this moment. */
  setTime(when: Date): void;
  /** Calls back with what was clicked; returns an unsubscribe. */
  onPick(callback: (picked: Pick) => void): () => void;
  /** The ground in view, at most a degree across around the camera. */
  viewArea(): Area;
  /** Shows these thermal networks, or hides the layer with null. */
  showNetworks(networks: readonly Network[] | null): void;
  showHomeServers(on: boolean): void;
  /**
   * Colours one building by its EGID, as a click does, in every tile drawn from now on; null
   * clears it. Returns how many 3D features carry that EGID so far (0: not in the 3D data yet).
   */
  highlightBuilding(egid: number | null): number;
  /** How many 3D features of the highlighted building have been drawn so far. */
  highlightedCount(): number;
  /**
   * An orange pin for a building the 3D data does not have: a slim column at the register's
   * point, as tall as its storeys, with a dot on top. It claims no footprint: the register gives
   * a point and an area, not a shape. null removes it.
   */
  showMarker(marker: Marker | null): void;
  destroy(): void;
}

/** Where a building missing from swissBUILDINGS3D stands, from the register. */
export interface Marker {
  readonly lon: number;
  readonly lat: number;
  /** Height of the column in metres. */
  readonly heightM: number;
}

/** Radius of the marker's column, metres: thin enough not to look like the building. */
const PIN_RADIUS_M = 3;

const HIGHLIGHT = Color.fromCssColorString("#ff8a3d");

/** EGID and position of a clicked swissBUILDINGS3D feature, from the tile's own attributes. */
function readFeature(feature: Cesium3DTileFeature): Picked | null {
  const lon = Number(feature.getProperty("Longitude"));
  const lat = Number(feature.getProperty("Latitude"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const egid = Number(feature.getProperty("EGID"));
  return { egid: Number.isFinite(egid) && egid > 0 ? egid : null, lon, lat };
}

/** Puts the camera at a view at once, or flies there; resolves when it is there. */
function goTo(viewer: Viewer, view: View, seconds: number): Promise<void> {
  const options = {
    destination: Cartesian3.fromDegrees(view.lon, view.lat, view.height),
    orientation: {
      heading: CesiumMath.toRadians(view.heading),
      pitch: CesiumMath.toRadians(view.pitch),
      roll: 0,
    },
  };
  if (seconds === 0) {
    viewer.camera.setView(options);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    viewer.camera.flyTo({ ...options, duration: seconds, complete: resolve, cancel: resolve });
  });
}

/**
 * The 3D map: OSM everywhere, SWISSIMAGE and swisstopo terrain and buildings over Switzerland,
 * lit by the real sun, with the clock starting 20 minutes before today's sunset in Basel.
 * No Cesium ion: every layer is an open service named in sources.ts.
 */
export async function createScene(
  container: HTMLElement,
  options: { now?: Date; at?: Date | null } = {},
): Promise<Scene> {
  const now = options.now ?? new Date();
  const osm = new OpenStreetMapImageryProvider({
    url: OSM_TILES,
    credit: new Credit("© OpenStreetMap contributors (ODbL)"),
  });
  const viewer = new Viewer(container, {
    baseLayer: new ImageryLayer(osm),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
    // A transparent canvas, so the dusk sky painted behind it (duskSky) shows above the horizon.
    contextOptions: { webgl: { alpha: true } },
  });
  const { scene } = viewer;
  scene.globe.enableLighting = true;
  // While map tiles load, the globe shows a dark slate rather than a white or blue ball.
  scene.globe.baseColor = Color.fromCssColorString("#1b2330");
  scene.globe.dynamicAtmosphereLighting = true;
  scene.globe.dynamicAtmosphereLightingFromSun = true;
  // Cesium switches ground lighting off near the ground by default; keep it on at every height.
  scene.globe.lightingFadeOutDistance = 1;
  scene.globe.lightingFadeInDistance = 2;
  // Ground atmosphere is shaded per vertex and smears the aerial photos at dusk; the sky keeps it.
  scene.globe.showGroundAtmosphere = false;
  scene.globe.depthTestAgainstTerrain = true;
  scene.highDynamicRange = true;
  scene.backgroundColor = Color.TRANSPARENT;
  scene.fog.enabled = true;
  scene.fog.density = 4.0e-4;
  scene.postProcessStages.fxaa.enabled = true;

  const swissImage = viewer.imageryLayers.addImageryProvider(
    new UrlTemplateImageryProvider({
      url: SWISS_IMAGE,
      tilingScheme: new WebMercatorTilingScheme(),
      rectangle: Rectangle.fromDegrees(
        SWITZERLAND.west,
        SWITZERLAND.south,
        SWITZERLAND.east,
        SWITZERLAND.north,
      ),
      minimumLevel: 8,
      maximumLevel: 19,
      credit: new Credit("© swisstopo"),
    }),
  );

  // Canton borders: thin muted lines, drawn 5 km up so the Alps never hide them from above.
  const cantons = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
  cantons.show = false;
  let cantonsAsked = false;
  const borderMaterial = Material.fromType("Color", {
    color: Color.fromCssColorString("#4b3f72").withAlpha(0.85),
  });

  const clock = viewer.clock;
  clock.currentTime = JulianDate.fromDate(
    options.at ?? beforeSunset(now, ORIGIN.lat, ORIGIN.lon, 20),
  );
  clock.clockRange = ClockRange.UNBOUNDED;
  clock.multiplier = DAY_SPEED;
  if (options.at) clock.shouldAnimate = false;
  goTo(viewer, BASEL, 0);

  const [terrain, buildings] = await Promise.all([
    CesiumTerrainProvider.fromUrl(SWISS_TERRAIN, {
      requestVertexNormals: true,
      credit: new Credit("© swisstopo"),
    }),
    // Cesium's default detail (screen-space error 16): polite to swisstopo's servers.
    Cesium3DTileset.fromUrl(SWISS_BUILDINGS, {
      // Load the screen's edges as well as its centre, so the city runs to the horizon.
      foveatedScreenSpaceError: false,
    }),
  ]);
  if (viewer.isDestroyed()) throw new Error("The map closed while it was loading.");
  viewer.terrainProvider = terrain;
  const flat = new EllipsoidTerrainProvider();
  const shader = windowShader();
  buildings.customShader = shader;
  scene.primitives.add(buildings);
  // Dev builds only: a handle for debugging in the browser console.
  if (import.meta.env.DEV) Object.assign(window, { kachelDebug: { viewer, buildings } });

  const sun = new SunLight();
  scene.light = sun;
  const frame = originFrame();
  const onTick = () => {
    const when = JulianDate.toDate(clock.currentTime);
    const height = viewer.camera.positionCartographic.height;
    cantons.show = height > CANTONS_FROM_M;
    if (cantons.show && !cantonsAsked) {
      cantonsAsked = true;
      void loadCantons().then((rings) => {
        // A failed request is tried again after half a minute, not on the next frame.
        if (rings.length === 0) window.setTimeout(() => (cantonsAsked = false), 30_000);
        for (const ring of rings) {
          cantons.add({
            positions: Cartesian3.fromDegreesArrayHeights(ring.flatMap(([x, y]) => [x, y, 5000])),
            width: 1.5,
            material: borderMaterial,
          });
        }
      });
    }
    // The aerial photo stops at a rectangle around Switzerland; from high up that box shows.
    swissImage.show = !cantons.show;
    // From high up, Cesium's own day and night on the globe tell the story; Basel's dusk would not.
    const fromSpace = height > 150_000;
    // swisstopo's terrain ends at a ragged edge that shows as a seam from high up; up there the
    // relief is too small to see, so the globe goes flat until the camera comes back down.
    const wanted = height > 150_000 ? flat : terrain;
    if (viewer.terrainProvider !== wanted) viewer.terrainProvider = wanted;
    const night = fromSpace ? 0 : nightFactor(sunElevationDeg(when, ORIGIN.lat, ORIGIN.lon));
    updateWindows(shader, frame, viewer.camera, night, windowsLitShare(swissHour(when)));
    // Cesium's sun keeps shining from below the horizon: fade it and the sky's fill light out.
    sun.intensity = 2 * (1 - 0.92 * night);
    buildings.imageBasedLighting.imageBasedLightingFactor = new Cartesian2(
      1 - 0.85 * night,
      1 - 0.85 * night,
    );
    // Cesium's sky goes black a few degrees after sunset; from dusk on, our painted sky shows.
    if (scene.skyBox !== undefined) scene.skyBox.show = fromSpace;
    if (scene.skyAtmosphere !== undefined) scene.skyAtmosphere.show = night < 0.2;
    container.style.background = fromSpace ? "#04060c" : duskSky(night);
    // Cesium never darkens the ground fully after sunset, so dim the photos and maps by hand.
    for (const layer of [viewer.imageryLayers.get(0), swissImage]) {
      layer.brightness = 1 - 0.85 * night;
      layer.saturation = 1 - 0.7 * night;
    }
  };
  const removeTick = scene.preRender.addEventListener(onTick);

  const clicks = new ScreenSpaceEventHandler(scene.canvas);
  const listeners = new Set<(picked: Pick) => void>();
  const networks = networkLayer(viewer);
  const homeServers = homeServerLayer(viewer);
  let highlighted: Cesium3DTileFeature | null = null;
  // A building chosen by EGID (the tour): coloured in each tile the first time the tile is drawn,
  // tiles already loaded too, until the next click takes the highlight over.
  let chosenEgid: number | null = null;
  let scanned = new WeakSet<object>();
  const chosen: Cesium3DTileFeature[] = [];
  const scan = (tile: Cesium3DTile) => {
    // A tile not loaded yet has no content; it is scanned when it is drawn.
    const content = tile.content as Cesium3DTile["content"] | undefined;
    if (chosenEgid === null || content === undefined || scanned.has(content)) return;
    scanned.add(content);
    for (let i = 0; i < content.featuresLength; i++) {
      const feature = content.getFeature(i);
      if (Number(feature.getProperty("EGID")) !== chosenEgid) continue;
      feature.color = HIGHLIGHT;
      chosen.push(feature);
    }
  };
  const scanLoaded = (tile: Cesium3DTile) => {
    scan(tile);
    for (const child of tile.children) scanLoaded(child);
  };
  const removeTileVisible = buildings.tileVisible.addEventListener(scan);
  const clearChosen = () => {
    chosenEgid = null;
    for (const feature of chosen.splice(0)) feature.color = Color.WHITE;
  };
  let marker: Entity[] = [];
  clicks.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
    const hit: unknown = scene.pick(event.position);
    clearChosen();
    if (highlighted !== null) highlighted.color = Color.WHITE;
    highlighted = hit instanceof Cesium3DTileFeature ? hit : null;
    if (highlighted !== null) highlighted.color = HIGHLIGHT;
    const network = networks.networkOf(hit);
    const house = homeServers.houseOf(hit);
    const building =
      house !== null
        ? { egid: house.egid, lon: house.lon, lat: house.lat }
        : highlighted === null
          ? null
          : readFeature(highlighted);
    const picked: Pick =
      network !== null
        ? { kind: "network", network }
        : building !== null
          ? { kind: "building", building }
          : null;
    for (const l of listeners) l(picked);
  }, ScreenSpaceEventType.LEFT_CLICK);

  return {
    time: () => JulianDate.toDate(clock.currentTime),
    playing: () => clock.shouldAnimate,
    setPlaying: (on) => {
      clock.shouldAnimate = on;
    },
    flyTo: (view, seconds = 3) => goTo(viewer, view, seconds),
    tilesLoaded: () =>
      new Promise((resolve) => {
        const done = () => buildings.tilesLoaded && scene.globe.tilesLoaded;
        if (done()) return resolve();
        const remove = scene.postRender.addEventListener(() => {
          if (!done()) return;
          remove();
          resolve();
        });
      }),
    setTime: (when) => {
      clock.currentTime = JulianDate.fromDate(when);
    },
    onPick: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    viewArea: () => {
      const here = viewer.camera.positionCartographic;
      const lon = CesiumMath.toDegrees(here.longitude);
      const lat = CesiumMath.toDegrees(here.latitude);
      const box = { west: lon - 0.5, south: lat - 0.5, east: lon + 0.5, north: lat + 0.5 };
      const seen = viewer.camera.computeViewRectangle();
      if (seen === undefined) return box;
      return {
        west: Math.max(box.west, CesiumMath.toDegrees(seen.west)),
        south: Math.max(box.south, CesiumMath.toDegrees(seen.south)),
        east: Math.min(box.east, CesiumMath.toDegrees(seen.east)),
        north: Math.min(box.north, CesiumMath.toDegrees(seen.north)),
      };
    },
    showNetworks: (list) => {
      if (list === null) networks.hide();
      else networks.show(list);
    },
    showHomeServers: (on) => homeServers.setShown(on),
    highlightBuilding: (egid) => {
      clearChosen();
      if (highlighted !== null) highlighted.color = Color.WHITE;
      highlighted = null;
      chosenEgid = egid;
      scanned = new WeakSet();
      if (egid !== null) scanLoaded(buildings.root);
      return chosen.length;
    },
    highlightedCount: () => chosen.length,
    showMarker: (m) => {
      for (const e of marker) viewer.entities.remove(e);
      marker = [];
      if (m === null) return;
      marker = [
        viewer.entities.add({
          position: Cartesian3.fromDegrees(m.lon, m.lat),
          ellipse: {
            semiMajorAxis: PIN_RADIUS_M,
            semiMinorAxis: PIN_RADIUS_M,
            height: 0,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            extrudedHeight: m.heightM,
            extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
            material: HIGHLIGHT,
          },
        }),
        viewer.entities.add({
          position: Cartesian3.fromDegrees(m.lon, m.lat, m.heightM),
          point: {
            pixelSize: 18,
            color: HIGHLIGHT,
            outlineColor: Color.WHITE,
            outlineWidth: 3,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      ];
    },
    destroy: () => {
      removeTick();
      removeTileVisible();
      clicks.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
    },
  };
}
