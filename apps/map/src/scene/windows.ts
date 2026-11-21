import {
  Cartesian3,
  Cartesian4,
  CustomShader,
  LightingModel,
  Matrix4,
  Transforms,
  UniformType,
  type Camera,
} from "cesium";
import { ORIGIN } from "../places";

/** Storey height and window bay, in metres: a typical Basel block. */
const STOREY = 3.2;
const BAY = 2.8;
/** The camera offset is wrapped to a whole number of storeys and bays, so float32 stays exact. */
const WRAP_UP = STOREY * 500;
const WRAP_ALONG = BAY * 500;

/**
 * Lit windows on swissBUILDINGS3D walls at night. The buildings carry no windows, so this draws
 * a regular storey-and-bay pattern on every wall and lights a share of the cells, warm white.
 * It is an illustration of a lived-in city, not data about any building.
 *
 * The pattern is computed in eye space (precise near the camera) plus the camera's offset from
 * a fixed origin, so it stays fixed to the walls while the camera moves.
 */
export function windowShader(): CustomShader {
  return new CustomShader({
    lightingModel: LightingModel.PBR,
    uniforms: {
      u_night: { type: UniformType.FLOAT, value: 0 },
      u_lit: { type: UniformType.FLOAT, value: 0.5 },
      u_east: { type: UniformType.VEC3, value: new Cartesian3(1, 0, 0) },
      u_north: { type: UniformType.VEC3, value: new Cartesian3(0, 1, 0) },
      u_up: { type: UniformType.VEC3, value: new Cartesian3(0, 0, 1) },
      u_offset: { type: UniformType.VEC3, value: new Cartesian3() },
    },
    fragmentShaderText: /* glsl */ `
      float kachelHash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        // The sun lights the walls even from below the horizon, so dim them by hand at night,
        // to a faint warm grey, so the city reads as a city and not as a black hole.
        material.diffuse *= mix(vec3(1.0), vec3(0.16, 0.15, 0.17), u_night);
        material.specular *= 1.0 - 0.9 * u_night; // no bright sky glints on roofs at night
        material.roughness = mix(material.roughness, 1.0, u_night);
        if (u_night <= 0.0) return;
        mat3 toEye = mat3(czm_view);
        vec3 up = normalize(toEye * u_up);
        vec3 east = normalize(toEye * u_east);
        vec3 north = normalize(toEye * u_north);
        vec3 n = normalize(fsInput.attributes.normalEC);
        if (abs(dot(n, up)) > 0.35) return; // roofs and ground: no windows
        vec3 p = fsInput.attributes.positionEC;
        bool facesEastWest = abs(dot(n, east)) > abs(dot(n, north));
        float along = facesEastWest ? dot(p, north) + u_offset.y : dot(p, east) + u_offset.x;
        float height = dot(p, up) + u_offset.z;
        vec2 cell = vec2(along / ${BAY.toFixed(2)}, height / ${STOREY.toFixed(2)});
        vec2 f = fract(cell);
        float side = facesEastWest ? sign(dot(n, east)) : 2.0 * sign(dot(n, north));
        vec2 id = floor(cell) + vec2(side * 101.0, side * 37.0);
        float pane = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.82);
        float r = kachelHash(id);
        float lit = step(r, u_lit) * pane;
        vec3 warm = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.86, 0.62), kachelHash(id + 7.0));
        material.emissive += warm * lit * u_night * (0.8 + 0.6 * kachelHash(id + 3.0));
      }
    `,
  });
}

/** East, north and up at the origin, in Earth-fixed coordinates. */
export function originFrame(): {
  east: Cartesian3;
  north: Cartesian3;
  up: Cartesian3;
  at: Cartesian3;
} {
  const at = Cartesian3.fromDegrees(ORIGIN.lon, ORIGIN.lat, 0);
  const m = Transforms.eastNorthUpToFixedFrame(at);
  const column = (i: number) =>
    Cartesian3.normalize(
      Cartesian3.fromCartesian4(Matrix4.getColumn(m, i, new Cartesian4())),
      new Cartesian3(),
    );
  return { east: column(0), north: column(1), up: column(2), at };
}

/** Updates the shader for this frame: how dark it is, how many windows are lit, where the camera is. */
export function updateWindows(
  shader: CustomShader,
  frame: ReturnType<typeof originFrame>,
  camera: Camera,
  night: number,
  litShare: number,
): void {
  const d = Cartesian3.subtract(camera.positionWC, frame.at, new Cartesian3());
  const wrap = (v: number, w: number) => v - Math.floor(v / w) * w;
  shader.setUniform("u_night", night);
  shader.setUniform("u_lit", litShare);
  shader.setUniform("u_east", frame.east);
  shader.setUniform("u_north", frame.north);
  shader.setUniform("u_up", frame.up);
  shader.setUniform(
    "u_offset",
    new Cartesian3(
      wrap(Cartesian3.dot(d, frame.east), WRAP_ALONG),
      wrap(Cartesian3.dot(d, frame.north), WRAP_ALONG),
      wrap(Cartesian3.dot(d, frame.up), WRAP_UP),
    ),
  );
}
