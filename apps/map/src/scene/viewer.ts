import {
  Cartesian3,
  Cesium3DTileset,
  CesiumTerrainProvider,
  ClockRange,
  Credit,
  ImageryLayer,
  JulianDate,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  Rectangle,
  UrlTemplateImageryProvider,
  Viewer,
  WebMercatorTilingScheme,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { beforeSunset, swissHour } from "../clock";
import { BASEL, ORIGIN, type View } from "../places";
import { OSM_TILES, SWISS_BUILDINGS, SWISS_IMAGE, SWISS_TERRAIN, SWITZERLAND } from "../sources";
import { nightFactor, sunElevationDeg, windowsLitShare } from "../sun";
import { originFrame, updateWindows, windowShader } from "./windows";

/** Simulated seconds per real second: a whole day passes in about five minutes. */
export const DAY_SPEED = 300;

/** What the page needs from the 3D scene; tests pass a fake. */
export interface Scene {
  /** The simulated time on the map. */
  time(): Date;
  playing(): boolean;
  setPlaying(on: boolean): void;
  flyTo(view: View, seconds?: number): void;
  destroy(): void;
}

/** Puts the camera at a view at once, or flies there. */
function goTo(viewer: Viewer, view: View, seconds: number): void {
  const options = {
    destination: Cartesian3.fromDegrees(view.lon, view.lat, view.height),
    orientation: {
      heading: CesiumMath.toRadians(view.heading),
      pitch: CesiumMath.toRadians(view.pitch),
      roll: 0,
    },
  };
  if (seconds === 0) viewer.camera.setView(options);
  else viewer.camera.flyTo({ ...options, duration: seconds });
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
  });
  const { scene } = viewer;
  scene.globe.enableLighting = true;
  scene.globe.dynamicAtmosphereLighting = true;
  scene.globe.dynamicAtmosphereLightingFromSun = true;
  // Cesium switches ground lighting off near the ground by default; keep it on at every height.
  scene.globe.lightingFadeOutDistance = 1;
  scene.globe.lightingFadeInDistance = 2;
  // Ground atmosphere is shaded per vertex and smears the aerial photos at dusk; the sky keeps it.
  scene.globe.showGroundAtmosphere = false;
  scene.globe.depthTestAgainstTerrain = true;
  scene.highDynamicRange = true;
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
    Cesium3DTileset.fromUrl(SWISS_BUILDINGS),
  ]);
  if (viewer.isDestroyed()) throw new Error("The map closed while it was loading.");
  viewer.terrainProvider = terrain;
  const shader = windowShader();
  buildings.customShader = shader;
  scene.primitives.add(buildings);

  const frame = originFrame();
  const onTick = () => {
    const when = JulianDate.toDate(clock.currentTime);
    const night = nightFactor(sunElevationDeg(when, ORIGIN.lat, ORIGIN.lon));
    updateWindows(shader, frame, viewer.camera, night, windowsLitShare(swissHour(when)));
    // Cesium never darkens the ground fully after sunset, so dim the photos and maps by hand.
    for (const layer of [viewer.imageryLayers.get(0), swissImage]) {
      layer.brightness = 1 - 0.75 * night;
      layer.saturation = 1 - 0.5 * night;
    }
  };
  const removeTick = scene.preRender.addEventListener(onTick);

  return {
    time: () => JulianDate.toDate(clock.currentTime),
    playing: () => clock.shouldAnimate,
    setPlaying: (on) => {
      clock.shouldAnimate = on;
    },
    flyTo: (view, seconds = 3) => goTo(viewer, view, seconds),
    destroy: () => {
      removeTick();
      if (!viewer.isDestroyed()) viewer.destroy();
    },
  };
}
