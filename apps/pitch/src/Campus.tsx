import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { ChevronLeft, ChevronRight, Clapperboard, Home, Layers, Server } from "lucide-react";
import { type ReactNode, Suspense, useEffect, useMemo, useRef } from "react";
import {
  BackSide,
  Box3,
  type Camera as Camera3,
  DoubleSide,
  type Group,
  MathUtils,
  type Material,
  Mesh,
  PerspectiveCamera,
  type MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  Plane,
  type Scene,
  Spherical,
  Vector3,
  type WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import campusUrl from "../../../docs/models/fhnw-campus.glb?url";
import plantRoomUrl from "../../../docs/models/plantroom.glb?url";
import type { Step } from "./Assessment";
import { TARGET } from "./target";
import { lightLabel as label } from "./ui";

/**
 * FHNW Campus Dreispitz in the house step: our own Blender block (docs/models/fhnw-campus.glb,
 * 134.2 × 27.83 m, six storeys of 3.9 m) with its south-east corner cut away down to a basement,
 * where the film's plant room stands (docs/models/plantroom.glb: rack, heat exchanger, tank, pipes).
 * The basement and its place are ours, as in the film: the register has no plans of the building.
 * Metres, +Y up, +X along the long side (east), +Z out of the south front, origin mid-footprint.
 */

/** three's Draco decoder, served next to the app (vite.config.ts), for the plant room. */
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;
const HALF_L = 134.2 / 2;
const HALF_D = 27.83 / 2;
const STOREY = 3.9;
const STOREYS = 6;
const ROOF = STOREY * STOREYS;
/** The basement under the cut, deeper than the model's 3 m plinth. */
const DEPTH = 4.6;
/** The cut: from these lines to past the east end and the south front, as in the film. */
const CUT_X0 = HALF_L - 17;
const CUT_Z0 = HALF_D - 13;
const CUT_X1 = HALF_L + 5;
const CUT_Z1 = HALF_D + 5;
/** Where the plant room stands in the basement: under the building, near the cut's corner. */
const PLANT_AT = new Vector3(HALF_L - 8.5, -DEPTH, HALF_D - 6);
/** The model's tank, once the room stands there: the risers leave from it. */
const TANK_AT = new Vector3(PLANT_AT.x + 1.75, -DEPTH + 1.2, PLANT_AT.z - 1.25);

const COLORS = {
  ground: "#e7e4dd",
  soil: "#6b5a4a",
  slab: "#dcd8d0",
  basement: "#a9a39a",
  hot: "#e5483a",
  cold: "#2f6fd6",
  hover: "#ea580c",
  section: "#b5afa6",
} as const;
/** Columns on the cut's open edges: the south front and the east end. */
const COLUMNS: [number, number][] = [
  [HALF_L - 0.4, HALF_D - 0.4],
  [HALF_L - 8.4, HALF_D - 0.4],
  [HALF_L - 0.4, HALF_D - 6.9],
];

/** The camera's aim for each step: the block, its storeys, the plant room, its tank. */
export type CampusFocus = "building" | "storeys" | "plant" | "tank";
export const CAMPUS_FOCUS: Partial<Record<Step, CampusFocus>> = {
  Building: "building",
  "Heat today": "plant",
  Use: "storeys",
  "Hot water": "tank",
  Result: "storeys",
};

type Framing = {
  target: [number, number, number];
  distance: number;
  polar: number;
  azimuth: number;
};
const FRAMING: Record<CampusFocus, Framing> = {
  building: { target: [0, 9, 0], distance: 175, polar: 1.12, azimuth: 0.62 },
  storeys: { target: [HALF_L - 10, 7, HALF_D - 4], distance: 82, polar: 1.02, azimuth: 0.72 },
  plant: { target: [PLANT_AT.x, -DEPTH + 1.8, PLANT_AT.z], distance: 26, polar: 1.0, azimuth: 0.7 },
  tank: { target: [TANK_AT.x, TANK_AT.y, TANK_AT.z], distance: 9, polar: 1.08, azimuth: 0.5 },
};
/** A storey from the cut, a little above it; -1 is the basement. */
const levelFraming = (level: number): Framing =>
  level < 0
    ? FRAMING.plant
    : {
        target: [HALF_L - 9, level * STOREY + 1.6, HALF_D - 6],
        distance: 40,
        polar: 0.95,
        azimuth: 0.7,
      };

/** The levels, top first, for the card: five upper floors, the ground floor and the basement. */
export const LEVELS = [5, 4, 3, 2, 1, 0, -1] as const;
export type Level = (typeof LEVELS)[number];
export const levelName = (l: Level) =>
  l < 0 ? "Basement" : l === 0 ? "Ground floor" : `Floor ${l}`;
/** Each storey's share of the register's heated area. */
const STOREY_M2 = Math.round(TARGET.building.areaM2 / STOREYS);

// ─── Camera ──────────────────────────────────────────────────────────────────

/** Orbit by drag, and glide to a new framing when it changes (as in House.tsx, at campus scale). */
/**
 * Phones and tablets in portrait, as House.tsx: further back so the block fits the narrow screen,
 * and the picture moved up above the bottom sheet. 1 and 0 on a laptop.
 */
function portraitFit(width: number, height: number, compact: boolean) {
  if (!compact) return { pull: 1, lift: 0 };
  // The block is long: it needs more room across than the house
  return { pull: Math.min(3.2, Math.max(1, 1.3 / (width / height))), lift: 0.3 };
}

function Camera({
  target,
  distance: near,
  polar,
  azimuth,
  compact,
}: Framing & { compact: boolean }) {
  const { camera, gl, size } = useThree();
  const { pull, lift } = portraitFit(size.width, size.height, compact);
  const distance = near * pull;
  useEffect(() => offsetView(camera, size.width, size.height, lift), [camera, size, lift]);
  const controls = useRef<OrbitControls>(null);
  const goal = useRef<{ target: Vector3; position: Vector3 } | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    Object.assign(c, {
      enableDamping: true,
      enablePan: false,
      minDistance: 8,
      maxDistance: 320 * pull,
      maxPolarAngle: 1.45,
    });
    c.target.set(0, 9, 0);
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl, pull]);
  const [x, y, z] = target;
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const view = new Spherical(distance, polar, azimuth);
    const t = new Vector3(x, y, z);
    goal.current = { target: t, position: t.clone().add(new Vector3().setFromSpherical(view)) };
  }, [x, y, z, distance, polar, azimuth]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      const k = 1 - Math.exp(-3 * dt);
      c.target.lerp(g.target, k);
      camera.position.lerp(g.position, k);
      if (camera.position.distanceTo(g.position) < 0.05) goal.current = null;
    }
    c.update(dt);
  });
  return null;
}

/** Moves the picture up by `lift` of the height without turning the camera. */
function offsetView(camera: Camera3, width: number, height: number, lift: number) {
  if (!(camera instanceof PerspectiveCamera)) return;
  if (lift) camera.setViewOffset(width, height, 0, height * lift, width, height);
  else camera.clearViewOffset();
}

// ─── The cut ─────────────────────────────────────────────────────────────────

/**
 * The cut-away corner as four clipping planes, clipped where all four agree (clipIntersection):
 * x above x0, x below CUT_X1, z above z0, z below CUT_Z1. It opens from the corner outwards.
 */
function useCut(open: boolean) {
  const planes = useMemo(
    () => [
      new Plane(new Vector3(-1, 0, 0), CUT_X1),
      new Plane(new Vector3(1, 0, 0), -CUT_X1),
      new Plane(new Vector3(0, 0, -1), CUT_Z1),
      new Plane(new Vector3(0, 0, 1), -CUT_Z1),
    ],
    [],
  );
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = MathUtils.damp(t.current, open ? 1 : 0, 2.2, dt);
    moveCut(planes, t.current);
  });
  return { planes, t };
}

/** Moves the cut's two inner planes to where it begins at `t` (0 closed, 1 open). */
function moveCut([x0, , z0]: Plane[], t: number) {
  if (x0) x0.constant = MathUtils.lerp(CUT_X1, CUT_X0, t);
  if (z0) z0.constant = MathUtils.lerp(CUT_Z1, CUT_Z0, t);
}

/** The x and z where the cut begins, for the pit and the slabs that fill it. */
const cutStart = (t: number) => ({
  x0: MathUtils.lerp(CUT_X1, CUT_X0, t),
  z0: MathUtils.lerp(CUT_Z1, CUT_Z0, t),
});

/** Clip a loaded model's materials by the cut, both faces drawn so the cut shows inside. */
function clipped(root: Object3D, planes: Plane[]) {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[];
    const next = mats.map((m) => {
      const c = m.clone() as MeshStandardMaterial;
      c.clippingPlanes = planes;
      c.clipIntersection = true;
      c.side = DoubleSide;
      // Daylight: the lit windows of the film's dusk read as a faint glow only
      if ("emissiveIntensity" in c) c.emissiveIntensity = 0.25;
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
}

function CampusBlock({ planes }: { planes: Plane[] }) {
  const gltf = useLoader(GLTFLoader, campusUrl);
  const model = useMemo(() => {
    const m = gltf.scene.clone(true);
    clipped(m, planes);
    return m;
  }, [gltf, planes]);
  return <primitive object={model} />;
}

/** The ground, with the cut's hole in it, and the pit under the hole: earth walls, a concrete floor. */
function Ground({ planes, cut }: { planes: Plane[]; cut: { current: number } }) {
  const pit = useRef<Group>(null);
  useFrame(() => {
    const p = pit.current;
    if (!p) return;
    const { x0, z0 } = cutStart(cut.current);
    const w = Math.max(0.01, CUT_X1 - x0);
    const d = Math.max(0.01, CUT_Z1 - z0);
    p.scale.set(w, DEPTH, d);
    p.position.set(x0 + w / 2, -DEPTH / 2, z0 + d / 2);
    p.visible = cut.current > 0.01;
  });
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <circleGeometry args={[420, 64]} />
        <meshStandardMaterial
          color={COLORS.ground}
          roughness={1}
          clippingPlanes={planes}
          clipIntersection
        />
      </mesh>
      {/* Only the far walls and floor of the pit show: the inside of a box */}
      <group ref={pit}>
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={COLORS.soil} roughness={1} side={BackSide} />
        </mesh>
        <mesh position-y={-0.5 + 0.002} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={COLORS.basement} roughness={0.9} />
        </mesh>
      </group>
    </>
  );
}

/** The storey slabs inside the cut, so it reads as floors, not a hollow box; one lit when hovered. */
function Slabs({ cut, hot }: { cut: { current: number }; hot: Level | null }) {
  const group = useRef<Group>(null);
  const xWall = useRef<Mesh>(null);
  const zWall = useRef<Mesh>(null);
  const columns = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { x0, z0 } = cutStart(cut.current);
    const w = Math.max(0.01, HALF_L - x0);
    const d = Math.max(0.01, HALF_D - z0);
    g.children.forEach((c) => {
      c.scale.x = w;
      c.scale.z = d;
      c.position.x = x0 + w / 2;
      c.position.z = z0 + d / 2;
    });
    g.visible = cut.current > 0.01;
    // The section through the rest of the building, where the cut ends
    xWall.current?.scale.set(1, 1, d);
    xWall.current?.position.set(x0, ROOF / 2, z0 + d / 2);
    zWall.current?.scale.set(w, 1, 1);
    zWall.current?.position.set(x0 + w / 2, ROOF / 2, z0);
    if (xWall.current) xWall.current.visible = g.visible;
    if (zWall.current) zWall.current.visible = g.visible;
    if (columns.current) columns.current.visible = cut.current > 0.97;
  });
  return (
    <>
      <mesh ref={xWall}>
        <boxGeometry args={[0.3, ROOF, 1]} />
        <meshStandardMaterial color={COLORS.section} roughness={0.95} />
      </mesh>
      <mesh ref={zWall}>
        <boxGeometry args={[1, ROOF, 0.3]} />
        <meshStandardMaterial color={COLORS.section} roughness={0.95} />
      </mesh>
      {/* Columns on the open edges, so the floors stand on something */}
      <group ref={columns}>
        {COLUMNS.map(([x, z]) => (
          <mesh key={`${x},${z}`} position={[x, ROOF / 2, z]}>
            <boxGeometry args={[0.5, ROOF, 0.5]} />
            <meshStandardMaterial color={COLORS.slab} roughness={0.9} />
          </mesh>
        ))}
      </group>
      <group ref={group}>
        {Array.from({ length: STOREYS }, (_, i) => i + 1).map((k) => (
          <mesh key={k} position-y={k * STOREY - 0.2}>
            <boxGeometry args={[1, 0.4, 1]} />
            <meshStandardMaterial color={COLORS.slab} roughness={0.9} />
          </mesh>
        ))}
        {/* The hovered or open level, as a glow filling its storey in the cut */}
        {hot !== null && (
          <mesh
            position-y={hot < 0 ? -DEPTH / 2 : hot * STOREY + STOREY / 2}
            scale-y={hot < 0 ? DEPTH : STOREY - 0.4}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={COLORS.hover} transparent opacity={0.22} depthWrite={false} />
          </mesh>
        )}
      </group>
    </>
  );
}

/** The two risers from the plant room up through the storeys: flow red, return blue. */
function Risers({ cut }: { cut: { current: number } }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (g) g.visible = cut.current > 0.6;
  });
  // From the top of the tank up to the roof
  const bottom = TANK_AT.y + 0.7;
  const h = ROOF - bottom;
  return (
    <group ref={group} position={[TANK_AT.x, bottom + h / 2, TANK_AT.z]}>
      <mesh position-x={-0.13}>
        <cylinderGeometry args={[0.08, 0.08, h, 12]} />
        <meshStandardMaterial color={COLORS.hot} roughness={0.5} />
      </mesh>
      <mesh position-x={0.13}>
        <cylinderGeometry args={[0.08, 0.08, h, 12]} />
        <meshStandardMaterial color={COLORS.cold} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** The room's walls, ceiling and door: hidden while the camera looks at them from outside. */
const ENCLOSURE = /^(Wall_|Ceiling|Door_)/;
type Panel = { object: Object3D; at: Vector3; out: Vector3 };

/** The film's plant room, its floor on the basement's, its near walls out of the camera's way. */
function PlantRoom({ cut }: { cut: { current: number } }) {
  const gltf = useLoader(GLTFLoader, plantRoomUrl, (loader) => {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    loader.setDRACOLoader(draco);
  });
  const { camera } = useThree();
  const { room, panels } = useMemo(() => {
    const r = gltf.scene;
    // Stand it on the basement floor, centred on its spot (from scratch: memos can run twice)
    r.position.set(0, 0, 0);
    r.updateMatrixWorld(true);
    const box = new Box3().setFromObject(r);
    const centre = box.getCenter(new Vector3());
    r.position.set(PLANT_AT.x - centre.x, PLANT_AT.y - box.min.y, PLANT_AT.z - centre.z);
    r.updateMatrixWorld(true);
    const mid = new Box3().setFromObject(r).getCenter(new Vector3());
    const list: Panel[] = [];
    r.traverse((o) => {
      if (!ENCLOSURE.test(o.name)) return;
      const b = new Box3().setFromObject(o);
      const at = b.getCenter(new Vector3());
      const size = b.getSize(new Vector3());
      const d = at.clone().sub(mid);
      const thin = size.x <= size.y && size.x <= size.z ? "x" : size.y <= size.z ? "y" : "z";
      const out = new Vector3();
      out[thin] = Math.sign(d[thin]) || 1;
      list.push({ object: o, at, out });
    });
    return { room: r, panels: list };
  }, [gltf]);
  const toCamera = useMemo(() => new Vector3(), []);
  useFrame(() => showRoom(room, panels, camera.position, toCamera, cut.current > 0.3));
  return <primitive object={room} />;
}

/** Shows the room once the cut is open, without the walls between it and the camera. */
function showRoom(room: Object3D, panels: Panel[], eye: Vector3, scratch: Vector3, open: boolean) {
  room.visible = open;
  for (const p of panels) p.object.visible = scratch.copy(eye).sub(p.at).dot(p.out) < 0;
}

/** Soft studio light for the plant room's metals, as in the map's Inside view. */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => studioLight(gl, scene), [gl, scene]);
  return null;
}

/** Lights `scene` with a soft room environment; returns its clean-up. */
function studioLight(gl: WebGLRenderer, scene: Scene) {
  const pmrem = new PMREMGenerator(gl);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.6;
  return () => {
    scene.environment = null;
    env.dispose();
    pmrem.dispose();
  };
}

function Campus({ focus, level, hover }: CampusProps) {
  // Whole block for the first question; cut open for the rest, or when a level is looked at
  const open = focus !== "building" || level !== null || hover !== null;
  const { planes, t } = useCut(open);
  return (
    <>
      <Ground planes={planes} cut={t} />
      <Suspense fallback={null}>
        <CampusBlock planes={planes} />
      </Suspense>
      <Slabs cut={t} hot={hover ?? (level === -1 ? null : level)} />
      <Risers cut={t} />
      <Suspense fallback={null}>
        <PlantRoom cut={t} />
      </Suspense>
    </>
  );
}

type CampusProps = {
  focus: CampusFocus | null;
  level: Level | null;
  hover: Level | null;
  /** A phone or tablet (compact.ts): the camera stands back and the picture moves up. */
  compact: boolean;
};

/** The campus in 3D on a transparent canvas: drag to orbit; the questions move the camera. */
export function CampusScene(props: CampusProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [150, 110, 160], fov: 35, near: 0.5, far: 2000 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <hemisphereLight args={["#ffffff", "#d8d4cc", 1.3]} />
      <directionalLight position={[60, 120, 90]} intensity={2.2} />
      <Environment />
      <Camera
        {...(props.level !== null ? levelFraming(props.level) : FRAMING[props.focus ?? "storeys"])}
        compact={props.compact}
      />
      <Campus {...props} />
    </Canvas>
  );
}

const row = "flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors";
/** The plant room's parts, as labelled in the film. */
const PARTS = ["Server rack", "Pump", "Heat exchanger", "Tank", "Backup heater"];
/** The film of the plant room with its parts labelled (docs/media, media-v1 release). */
const SETUP_FILM = "https://github.com/CPD9/kachel/releases/download/media-v1/setup.mp4";

/**
 * The campus's levels on the right, where the house lists its floors: hover one to see it in the
 * cut, click to go there. The basement holds the plant room and a link to it in motion.
 */
export function CampusLevels({
  level,
  hover,
  onHover,
  onOpen,
  temps,
  compact,
  tempControl,
}: {
  level: Level | null;
  hover: Level | null;
  onHover: (l: Level | null) => void;
  onOpen: (l: Level | null) => void;
  temps: Record<number, number>;
  compact: boolean;
  /** The room temperature stepper for the open level, from HouseView. */
  tempControl: (l: Level) => ReactNode;
}) {
  return (
    <>
      <div className="px-2 pt-2 pb-1">
        {level !== null ? (
          <>
            <button
              onClick={() => onOpen(null)}
              className="-ml-1 flex items-center text-[11.5px] font-medium text-clay hover:underline"
            >
              <ChevronLeft size={14} /> All levels
            </button>
            <h3 className="mt-1.5 text-[17px] leading-tight font-semibold">{levelName(level)}</h3>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {level < 0
                ? "The plant room: our model, as in the film"
                : `≈ ${STOREY_M2.toLocaleString("en-GB")} m² · a sixth of ${TARGET.building.areaM2.toLocaleString("en-GB")} m² (GWR)`}
            </p>
          </>
        ) : (
          <>
            <p className={label}>
              <Layers size={12} /> Levels
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {compact
                ? "Tap a level to see it in the cut."
                : "Hover a level to see it in the cut, click to go there, Esc to go back."}
            </p>
          </>
        )}
      </div>

      <div className="mt-2 border-t border-black/[0.06] pt-1.5">
        {level !== null ? (
          level < 0 ? (
            <>
              <p className={`${label} px-2 pt-1 pb-1`}>In the plant room</p>
              <ul>
                {PARTS.map((p) => (
                  <li key={p} className={`${row} py-1.5 text-[11.5px] font-medium`}>
                    {p}
                  </li>
                ))}
              </ul>
              <a
                href={SETUP_FILM}
                target="_blank"
                rel="noreferrer"
                className="mx-1 mt-1 mb-1 flex items-center justify-center gap-1.5 rounded-full bg-black/[0.05] py-2 text-[12px] font-medium hover:bg-black/10"
              >
                <Clapperboard size={13} /> See it in motion (20 s)
              </a>
            </>
          ) : (
            tempControl(level)
          )
        ) : (
          <ul>
            {LEVELS.map((l) => (
              <li key={l}>
                <button
                  onMouseEnter={() => onHover(l)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onOpen(l)}
                  className={`${row} !py-1.5 ${hover === l ? "bg-black/[0.05]" : "hover:bg-black/[0.03]"}`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-xl text-[11px] font-semibold transition-colors ${
                      hover === l ? "bg-clay/20 text-clay" : "bg-black/[0.05] text-ink/70"
                    }`}
                  >
                    {l < 0 ? <Server size={13} /> : l === 0 ? <Home size={13} /> : l}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium">{levelName(l)}</span>
                    <span className="block text-[10.5px] text-muted">
                      {l < 0
                        ? "Plant room · servers, tank"
                        : `≈ ${STOREY_M2.toLocaleString("en-GB")} m² · ${temps[l] ?? 21} °C`}
                    </span>
                  </span>
                  <ChevronRight size={14} className="ml-auto shrink-0 text-ink/30" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
