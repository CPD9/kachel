import {
  Axis,
  Cartographic,
  Cartesian3,
  CustomShader,
  HeadingPitchRoll,
  LightingModel,
  Math as CesiumMath,
  Model,
  sampleTerrainMostDetailed,
  Transforms,
  UniformType,
  type TerrainProvider,
} from "cesium";
import campusUrl from "../../../../docs/models/fhnw-campus.glb?url";

/**
 * FHNW Campus Dreispitz as our own block model (docs/models/fhnw-campus.glb): swissBUILDINGS3D
 * predates the building, so the tiles have a building site here. The block is 134.2 × 27.83 m,
 * the GWR's 3,735 m² footprint, six storeys. Its middle and its long side follow the outline in
 * OpenStreetMap (way 1536280767), which fits the building site on SWISSIMAGE; the GWR point
 * (7.606272, 47.537456) lies inside its east end. Shape and orientation stay our assumptions.
 */
export const CAMPUS = {
  egid: 243058419,
  lon: 7.605462,
  lat: 47.53739,
  /** The long side runs 7.6° north of east; Cesium's heading turns clockwise, so negative. */
  headingDeg: -7.6,
  lengthM: 134.2,
  depthM: 27.83,
} as const;

/** Its corners and middle, where the ground height is sampled. */
export function campusFootprint(): Cartographic[] {
  const h = CesiumMath.toRadians(-CAMPUS.headingDeg);
  const metresPerDegLat = 111_132;
  const metresPerDegLon = 111_320 * Math.cos(CesiumMath.toRadians(CAMPUS.lat));
  const at = (along: number, across: number) => {
    const east = along * Math.cos(h) - across * Math.sin(h);
    const north = along * Math.sin(h) + across * Math.cos(h);
    return Cartographic.fromDegrees(
      CAMPUS.lon + east / metresPerDegLon,
      CAMPUS.lat + north / metresPerDegLat,
    );
  };
  const a = CAMPUS.lengthM / 2;
  const b = CAMPUS.depthM / 2;
  return [at(0, 0), at(-a, -b), at(a, -b), at(a, b), at(-a, b)];
}

/**
 * Lit like the city at dusk (windows.ts): the sun keeps lighting the model from below the
 * horizon, so its colours are dimmed by hand at night, and the windows lit in the model's
 * emissive texture glow only after sunset. Orange while its card is open, as a clicked building.
 */
export function campusShader(): CustomShader {
  return new CustomShader({
    lightingModel: LightingModel.PBR,
    uniforms: {
      u_night: { type: UniformType.FLOAT, value: 0 },
      u_highlight: { type: UniformType.FLOAT, value: 0 },
    },
    fragmentShaderText: /* glsl */ `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 windows = material.emissive;
        material.diffuse *= mix(1.0, 0.16, u_night);
        material.specular *= 1.0 - 0.9 * u_night;
        // Street light and sky glow, as on the city's walls, and the lit windows.
        material.emissive = vec3(0.05, 0.055, 0.075) * u_night + windows * u_night * 1.6;
        vec3 orange = vec3(1.0, 0.54, 0.24);
        material.diffuse = mix(material.diffuse, orange, 0.7 * u_highlight);
        material.emissive += orange * u_highlight * (0.08 + 0.3 * u_night);
      }
    `,
  });
}

/** The campus model on the map. */
export interface Campus {
  readonly model: Model;
  /** Darkness from 0 (day) to 1 (night), as for the city. */
  setNight(night: number): void;
  setHighlight(on: boolean): void;
}

/** Loads the block model and stands it on the terrain; rejects if it cannot be loaded. */
export async function loadCampus(terrain: TerrainProvider): Promise<Campus> {
  const ground = await sampleTerrainMostDetailed(terrain, campusFootprint());
  const heights = ground.map((c) => c.height).filter(Number.isFinite);
  // The lowest corner: the block's plinth reaches 3 m below its ground floor, so a corner on
  // higher ground shows no gap, and none floats.
  const base = heights.length > 0 ? Math.min(...heights) : 0;
  const shader = campusShader();
  const model = await Model.fromGltfAsync({
    url: campusUrl,
    modelMatrix: Transforms.headingPitchRollToFixedFrame(
      Cartesian3.fromDegrees(CAMPUS.lon, CAMPUS.lat, base),
      new HeadingPitchRoll(CesiumMath.toRadians(CAMPUS.headingDeg), 0, 0),
    ),
    customShader: shader,
    // The model's +X runs east and +Y north before the heading turns it (as in Blender);
    // Cesium's default would take glTF's +Z as forward and turn the block a quarter.
    forwardAxis: Axis.X,
  });
  return {
    model,
    setNight: (night) => shader.setUniform("u_night", night),
    setHighlight: (on) => shader.setUniform("u_highlight", on ? 1 : 0),
  };
}
