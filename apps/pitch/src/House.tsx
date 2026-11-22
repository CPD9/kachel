import {
  Canvas,
  useFrame,
  useThree,
  type ThreeElements,
  type ThreeEvent,
} from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  ExtrudeGeometry,
  type Group,
  MathUtils,
  Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  PerspectiveCamera,
  Spherical,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Figure, type Rig, seeded, stride } from "./Figure";
import type { Answers, Emitters, Fuel, Windows } from "./sizing";
import { Surroundings } from "./Surroundings";
import { useCompact } from "./compact";

/** Floor-to-floor height, and the clear height of a room below the next slab. */
const H = 2.8;
const INNER = 2.6;
/** Footprint: x from -W/2 to W/2, z from -D/2 to D/2; the front (street side) faces +z. */
const W = 11;
const D = 8;
const WALL = 0.2;
/** The ground floor sits on an ochre plinth, as on Byfangweg 18. */
const SOCLE = 1;
/** Roof height above the eaves, and how far it overhangs front and back. */
const ROOF = 3.2;
const EAVES = 0.4;
/** Window axes across the front and back. */
const BAYS = [-4.3, -2.15, 0, 2.05, 4.15];
/** Window axes along the sides. */
const SIDE_BAYS = [-2.6, 0, 2.6];

type Vec3 = [number, number, number];
/** A room's rectangle on its floor: [x0, z0, x1, z1]. */
type Rect = [number, number, number, number];
type RoomKind = "living" | "kitchen" | "bath" | "bedroom";
export type Room = { name: string; kind: RoomKind; rect: Rect; area: number };
export type FloorId = "ground" | "upper";
export type Floor = {
  id: FloorId;
  level: number;
  name: string;
  area: number;
  rooms: Room[];
  /** Inner walls between the rooms: [x0, z0, x1, z1]. */
  walls: Rect[];
};

/** The demo house: two storeys under a pitched roof. */
export const FLOORS: Floor[] = [
  {
    id: "ground",
    level: 0,
    name: "Ground floor",
    area: 150,
    rooms: [
      { name: "Living room", kind: "living", rect: [-5.5, -4, 1.4, 4], area: 80 },
      { name: "Kitchen", kind: "kitchen", rect: [1.4, -4, 5.5, 0.7], area: 40 },
      { name: "Bathroom", kind: "bath", rect: [1.4, 0.7, 5.5, 4], area: 30 },
    ],
    walls: [
      [1.4, -4, 1.4, 4],
      [1.4, 0.7, 5.5, 0.7],
    ],
  },
  {
    id: "upper",
    level: 1,
    name: "First floor",
    area: 150,
    rooms: [
      { name: "Bedroom", kind: "bedroom", rect: [-5.5, -4, 0, 4], area: 65 },
      { name: "Kids' room", kind: "bedroom", rect: [0, -4, 5.5, 0.7], area: 50 },
      { name: "Bathroom", kind: "bath", rect: [0, 0.7, 5.5, 4], area: 35 },
    ],
    walls: [
      [0, -4, 0, 4],
      [0, 0.7, 5.5, 0.7],
    ],
  },
];

const COLORS = {
  wall: "#ece7df",
  glass: "#ece7df",
  window: "#2c3440",
  roof: "#3a3532",
  plaster: "#f1efe9",
  ochre: "#e3b46a",
  ochreDark: "#c99550",
  door: "#7c2622",
  pipe: "#222222",
  stone: "#9b958c",
  shrub: "#4e6b35",
  pot: "#a06a45",
  hover: "#ea580c",
  furniture: "#8a8178",
  radiator: "#f5f2ee",
  floor: { living: "#9c7656", bedroom: "#a8835f", kitchen: "#c9c6c0", bath: "#b9c3c8" },
} as const;

/** Where the camera looks: a target, how far away, how steep, and from which side. */
type Framing = { target: Vec3; distance: number; polar: number; azimuth?: number };
const HOUSE_FRAMING: Framing = { target: [0, 4.4, 0], distance: 32, polar: 1.15, azimuth: 0.55 };
const floorFraming = (level: number): Framing => ({
  target: [0, SOCLE + level * H + 0.6, 0],
  distance: 17,
  polar: 0.78,
  azimuth: 0.6,
});
/** Roof off, first floor lifted: looking into both floors from above. */
const CUTAWAY_FRAMING: Framing = { target: [0, 3.6, 0], distance: 26, polar: 0.9, azimuth: 0.6 };
/** Outside on the right: the heating plant beside the house and the chimney. */
const PLANT_FRAMING: Framing = {
  target: [6.2, 3.4, -1],
  distance: 21,
  polar: 1.12,
  azimuth: 1.05,
};
/** The part of the house a question is about. */
export type Focus = "windows" | "heating" | "energy" | "people";
/** From outside, behind the house: the back wall with its windows on both floors. */
const WINDOWS_FRAMING: Framing = {
  target: [0, SOCLE + H, -D / 2],
  distance: 17,
  polar: 1.3,
  azimuth: Math.PI - 0.45,
};

const FOCUS_FRAMING: Record<Focus, Framing> = {
  windows: WINDOWS_FRAMING,
  heating: CUTAWAY_FRAMING,
  energy: PLANT_FRAMING,
  people: { ...CUTAWAY_FRAMING, azimuth: 0.95 },
};

// ─── Camera ──────────────────────────────────────────────────────────────────

/**
 * Phones and tablets in portrait: how much further back the camera stands so the house fits the
 * narrow screen, and how far up (as a share of the height) the picture moves so the house sits
 * above the bottom sheet. 1 and 0 on a laptop.
 */
function portraitFit(width: number, height: number, compact: boolean) {
  if (!compact) return { pull: 1, lift: 0 };
  const aspect = width / height;
  return { pull: Math.min(2.6, Math.max(1, 0.95 / aspect)), lift: 0.24 };
}

/** Orbit by drag, and glide to a new framing when it changes (as in baselhack_2026_adobe's Venue). */
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
  // Moves the picture up without turning the camera: the house centres in the space above the sheet
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    if (lift)
      camera.setViewOffset(size.width, size.height, 0, size.height * lift, size.width, size.height);
    else camera.clearViewOffset();
  }, [camera, size.width, size.height, lift]);
  const controls = useRef<OrbitControls>(null);
  const goal = useRef<{ target: Vector3; position: Vector3 } | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    Object.assign(c, {
      enableDamping: true,
      enablePan: false,
      minDistance: 6,
      maxDistance: 50 * pull,
      maxPolarAngle: 1.45,
    });
    c.target.set(0, 4.4, 0);
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl, pull]);
  const [x, y, z] = target;
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const view = new Spherical().setFromVector3(camera.position.clone().sub(c.target));
    view.set(distance, polar, azimuth ?? view.theta);
    const t = new Vector3(x, y, z);
    goal.current = { target: t, position: t.clone().add(new Vector3().setFromSpherical(view)) };
  }, [x, y, z, distance, polar, azimuth, camera]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      // Fast at first, slowing down as it arrives
      const k = 1 - Math.exp(-4 * dt);
      c.target.lerp(g.target, k);
      camera.position.lerp(g.position, k);
      if (camera.position.distanceTo(g.position) < 0.05) goal.current = null;
    }
    c.update(dt);
  });
  return null;
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function Box({
  size,
  color,
  map,
  ...props
}: { size: Vec3; color: string; map?: Texture } & ThreeElements["mesh"]) {
  return (
    <mesh {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={map ? "#ffffff" : color} map={map ?? null} roughness={0.85} />
    </mesh>
  );
}

/** White render with horizontal grooves every ~45 cm, cached per wall size. */
const plasterCache = new Map<string, Texture>();
function plaster(w: number, h: number): Texture {
  const key = `${w}x${h}`;
  const cached = plasterCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = COLORS.plaster;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(120,110,100,${((i * 37) % 10) / 250})`;
      g.fillRect((i * 53) % 128, (i * 29) % 128, 2, 2);
    }
    g.fillStyle = "rgba(110,105,100,0.4)";
    g.fillRect(0, 0, 128, 4);
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(w / 2, h / 0.45);
  t.colorSpace = SRGBColorSpace;
  plasterCache.set(key, t);
  return t;
}

/**
 * Everything inside fades to a faint ghost when `solid` is off, so the street-side walls can be
 * looked through once a floor is hovered or opened. Meshes marked `userData.noFade` keep their own
 * opacity (the heat glow animates itself).
 */
function Fade({ solid, children }: { solid: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const k = solid ? 1 : 0.12;
    ref.current?.traverse((o) => {
      if (!(o instanceof Mesh) || o.userData.noFade) return;
      const m = o.material as MeshStandardMaterial;
      const base = (m.userData.base as number | undefined) ?? (m.userData.base = m.opacity);
      const goal = base * k;
      if (m.opacity === goal) return;
      m.opacity =
        Math.abs(m.opacity - goal) < 0.005 ? goal : MathUtils.damp(m.opacity, goal, 6, dt);
      // Opaque materials only switch to blending while they're see-through
      const transparent = m.opacity < 1;
      if (base === 1 && m.transparent !== transparent) {
        m.transparent = transparent;
        m.depthWrite = !transparent;
        m.needsUpdate = true;
      }
    });
  });
  return <group ref={ref}>{children}</group>;
}

/** A storey that eases up by `lift`: a peek when the floor below is hovered, gone when it's open. */
function Lift({
  y,
  lift,
  children,
  ...props
}: { y: number; lift: number; children: ReactNode } & ThreeElements["group"]) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.y = MathUtils.damp(g.position.y, y + lift, 6, dt);
    g.visible = g.position.y < y + 12;
  });
  return (
    <group ref={ref} position-y={y} {...props}>
      {children}
    </group>
  );
}

/** Simple furniture for a room, placed from its rectangle, plus a radiator on the outer wall. */
function Furniture({ room, radiator, warm }: { room: Room; radiator: boolean; warm: boolean }) {
  const [x0, z0, x1, z1] = room.rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const c = COLORS.furniture;
  const items: ReactNode[] = [];
  switch (room.kind) {
    case "living":
      items.push(
        <Box key="sofa" size={[2.4, 0.7, 0.9]} color={c} position={[cx, 0.35, z0 + 1]} />,
        <Box key="table" size={[1.2, 0.4, 0.7]} color="#5b4636" position={[cx, 0.2, cz]} />,
      );
      break;
    case "kitchen":
      items.push(
        <Box
          key="counter"
          size={[x1 - x0 - 0.4, 0.9, 0.6]}
          color="#f2efea"
          position={[cx, 0.45, z0 + 0.45]}
        />,
        <Box key="table" size={[1, 0.75, 1]} color="#5b4636" position={[cx, 0.375, cz + 0.6]} />,
      );
      break;
    case "bath":
      items.push(
        <Box key="tub" size={[1.7, 0.55, 0.8]} color="#ffffff" position={[cx, 0.275, z1 - 0.6]} />,
      );
      break;
    case "bedroom":
      items.push(
        <Box key="bed" size={[1.6, 0.5, 2]} color="#e9e4dc" position={[cx, 0.25, z0 + 1.2]} />,
        <Box key="cupboard" size={[1.4, 2, 0.6]} color={c} position={[cx, 1, z1 - 0.45]} />,
      );
      break;
  }
  // Radiator under the back wall's window (glowing warm while the heating question is open)
  if (radiator)
    items.push(
      <Box
        key="radiator"
        size={[1, 0.55, 0.1]}
        color={warm ? "#f6a46e" : COLORS.radiator}
        position={[cx, 0.45, -D / 2 + WALL + 0.08]}
      />,
    );
  return <>{items}</>;
}

/** How each window type looks: frame colour, glass layers, bars, and how much heat glows out. */
const WINDOW_LOOK: Record<
  Windows,
  { frame: string; panes: number; cross: boolean; mullion: boolean; leak: number }
> = {
  single: { frame: "#7a5a3c", panes: 1, cross: true, mullion: true, leak: 0.5 },
  double: { frame: "#f4f2ee", panes: 2, cross: false, mullion: true, leak: 0.18 },
  triple: { frame: "#3a3f46", panes: 3, cross: false, mullion: false, leak: 0 },
};
const WIN_H = 1.6;
const WIN_W = 1.1;
/** Window centre above its floor. */
const WIN_Y = 1.4;

/** Orange glow in front of a window: the heat it lets out, gently pulsing. */
function HeatLeak({ w, z, strength }: { w: number; z: number; strength: number }) {
  const ref = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }, dt) => {
    const m = ref.current;
    if (!m) return;
    const goal = strength * (0.75 + 0.25 * Math.sin(clock.elapsedTime * 2.5));
    m.opacity = MathUtils.damp(m.opacity, goal, 5, dt);
    m.visible = m.opacity > 0.01;
  });
  return (
    <mesh position-z={z} userData={{ noFade: true }}>
      <planeGeometry args={[w + 0.35, WIN_H + 0.35]} />
      <meshBasicMaterial
        ref={ref}
        color={COLORS.hover}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

/** A shutter leaf, facing +z: slatted ("louvre") or panelled with a diamond cut-out. */
function Shutter({
  w,
  h,
  louvre,
  ...props
}: { w: number; h: number; louvre: boolean } & ThreeElements["group"]) {
  const slats = Math.floor(h / 0.14);
  return (
    <group {...props}>
      <Box size={[w, h, 0.04]} color={COLORS.ochre} />
      {louvre ? (
        Array.from({ length: slats - 1 }, (_, i) => (
          <Box
            key={i}
            size={[w - 0.1, 0.025, 0.02]}
            color={COLORS.ochreDark}
            position={[0, -h / 2 + ((i + 1) * h) / slats, 0.025]}
          />
        ))
      ) : (
        <>
          <Box
            size={[w - 0.12, h * 0.42, 0.015]}
            color={COLORS.ochreDark}
            position={[0, h * 0.2, 0.022]}
          />
          <Box
            size={[w - 0.12, h * 0.34, 0.015]}
            color={COLORS.ochreDark}
            position={[0, -h * 0.25, 0.022]}
          />
          <Box
            size={[0.09, 0.09, 0.02]}
            color="#3a2a1a"
            position={[0, h * 0.3, 0.035]}
            rotation-z={Math.PI / 4}
          />
        </>
      )}
    </group>
  );
}

/** How a window's shutters hang: folded back beside it, or closed over the glass. */
type Shutters = { closed: boolean; louvre: boolean };

/**
 * One window, built facing +z and turned into its wall: a dark opening, one to three layers of
 * glass, a frame (old wood with glazing bars, white, or slim anthracite), an ochre surround with
 * sill and cap, and a pair of ochre shutters.
 */
function Window({
  type,
  w = WIN_W,
  glow,
  shutters = { closed: false, louvre: false },
  ...props
}: { type: Windows; w?: number; glow: boolean; shutters?: Shutters } & ThreeElements["group"]) {
  const look = WINDOW_LOOK[type];
  const t = 0.07;
  // The wall is solid, so frame and glass stand just proud of it: a 12 cm deep frame, its
  // glass layers spread through that depth (visible from the side)
  const back = WALL / 2 + 0.01;
  const depth = 0.12;
  const mid = back + depth / 2;
  const bar = (size: Vec3, position: Vec3) => (
    <Box key={position.join()} size={size} color={look.frame} position={position} />
  );
  return (
    <group {...props}>
      <Box size={[w, WIN_H, WALL + 0.02]} color={COLORS.window} />
      {Array.from({ length: look.panes }, (_, i) => (
        <mesh key={i} position-z={back + ((i + 1) * depth) / (look.panes + 1)}>
          <boxGeometry args={[w - 0.04, WIN_H - 0.04, 0.012]} />
          <meshStandardMaterial color="#a9cbe0" transparent opacity={0.45} roughness={0.1} />
        </mesh>
      ))}
      {bar([w, t, depth], [0, WIN_H / 2 - t / 2, mid])}
      {bar([w, t, depth], [0, -WIN_H / 2 + t / 2, mid])}
      {bar([t, WIN_H, depth], [-w / 2 + t / 2, 0, mid])}
      {bar([t, WIN_H, depth], [w / 2 - t / 2, 0, mid])}
      {look.mullion && bar([t * 0.7, WIN_H, 0.03], [0, 0, back + depth - 0.015])}
      {look.cross && bar([w, t * 0.6, 0.03], [0, 0, back + depth - 0.015])}
      {/* Ochre surround, sill and cap */}
      <Box
        size={[w + 0.36, 0.18, 0.06]}
        color={COLORS.ochre}
        position={[0, WIN_H / 2 + 0.09, back + 0.03]}
      />
      <Box
        size={[w + 0.36, 0.18, 0.06]}
        color={COLORS.ochre}
        position={[0, -WIN_H / 2 - 0.09, back + 0.03]}
      />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          size={[0.18, WIN_H, 0.06]}
          color={COLORS.ochre}
          position={[s * (w / 2 + 0.09), 0, back + 0.03]}
        />
      ))}
      <Box
        size={[w + 0.5, 0.08, depth + 0.1]}
        color={COLORS.ochre}
        position={[0, -WIN_H / 2 - 0.2, mid + 0.04]}
      />
      <Box
        size={[w + 0.5, 0.1, 0.14]}
        color={COLORS.ochre}
        position={[0, WIN_H / 2 + 0.23, back + 0.07]}
      />
      {[-1, 1].map((s) =>
        shutters.closed ? (
          <Shutter
            key={s}
            w={w / 2 - 0.01}
            h={WIN_H}
            louvre={shutters.louvre}
            position={[(s * w) / 4, 0, back + depth + 0.03]}
          />
        ) : (
          <Shutter
            key={s}
            w={w / 2}
            h={WIN_H + 0.05}
            louvre={shutters.louvre}
            position={[s * (w / 2 + 0.2 + w / 4), 0, back + 0.03]}
          />
        ),
      )}
      <HeatLeak w={w} z={back + depth + 0.08} strength={glow && !shutters.closed ? look.leak : 0} />
    </group>
  );
}

/** The red front door in its ochre portal, built facing +z on the ground floor. */
function Door(props: ThreeElements["group"]) {
  const w = 1.1;
  const h = 2.3;
  const z = WALL / 2;
  return (
    <group {...props}>
      <Box
        size={[w + 0.6, h + 0.3, 0.08]}
        color={COLORS.ochre}
        position={[0, h / 2 + 0.1, z + 0.04]}
      />
      <Box size={[w + 0.8, 0.14, 0.2]} color={COLORS.ochre} position={[0, h + 0.3, z + 0.1]} />
      <Box size={[w, h, 0.06]} color={COLORS.door} position={[0, h / 2, z + 0.09]} />
      <Box size={[w - 0.14, 0.45, 0.03]} color={COLORS.window} position={[0, h - 0.3, z + 0.13]} />
      <Box size={[w, 0.07, 0.04]} color="#5d1b18" position={[0, h - 0.58, z + 0.13]} />
      <Box size={[0.35, 1, 0.02]} color="#1d1d1d" position={[0, 1.1, z + 0.13]} />
      {/* House number */}
      <Box size={[0.22, 0.14, 0.02]} color="#2d5b8a" position={[0, h + 0.1, z + 0.12]} />
    </group>
  );
}

/** Street front, as on Byfangweg 18: shutters closed on most windows, the door in the middle. */
const FRONT: Record<FloorId, (Shutters | "door")[]> = {
  ground: [
    { closed: true, louvre: false },
    { closed: true, louvre: false },
    "door",
    { closed: false, louvre: false },
    { closed: true, louvre: false },
  ],
  upper: [
    { closed: true, louvre: true },
    { closed: false, louvre: true },
    { closed: true, louvre: true },
    { closed: true, louvre: true },
    { closed: true, louvre: true },
  ],
};

/**
 * Outer walls in grooved white render. Back and left stay solid; the street front and the right
 * side fade to a ghost (`see`) so you can look in while a floor is hovered or open.
 */
function Walls({
  floor,
  windows,
  glow,
  see,
}: {
  floor: FloorId;
  windows: Windows;
  glow: boolean;
  see: boolean;
}) {
  const half = INNER / 2;
  const long = plaster(W, INNER);
  const short = plaster(D, INNER);
  return (
    <>
      <Box
        size={[W, INNER, WALL]}
        color={COLORS.plaster}
        map={long}
        position={[0, half, -D / 2 + WALL / 2]}
      />
      <Box
        size={[WALL, INNER, D]}
        color={COLORS.plaster}
        map={short}
        position={[-W / 2 + WALL / 2, half, 0]}
      />
      {BAYS.map((x) => (
        <Window
          key={x}
          type={windows}
          glow={glow}
          position={[x, WIN_Y, -D / 2 + WALL / 2]}
          rotation-y={Math.PI}
        />
      ))}
      {SIDE_BAYS.map((z) => (
        <Window
          key={z}
          type={windows}
          glow={glow}
          position={[-W / 2 + WALL / 2, WIN_Y, z]}
          rotation-y={-Math.PI / 2}
        />
      ))}
      <Fade solid={!see}>
        <Box
          size={[W, INNER, WALL]}
          color={COLORS.plaster}
          map={long}
          position={[0, half, D / 2 - WALL / 2]}
        />
        <Box
          size={[WALL, INNER, D - 2 * WALL]}
          color={COLORS.plaster}
          map={short}
          position={[W / 2 - WALL / 2, half, 0]}
        />
        {FRONT[floor].map((s, i) =>
          s === "door" ? (
            <Door key={i} position={[BAYS[i] ?? 0, 0, D / 2 - WALL / 2]} />
          ) : (
            <Window
              key={i}
              type={windows}
              glow={glow}
              shutters={s}
              position={[BAYS[i] ?? 0, WIN_Y, D / 2 - WALL / 2]}
            />
          ),
        )}
        {SIDE_BAYS.map((z) => (
          <Window
            key={z}
            type={windows}
            glow={glow}
            position={[W / 2 - WALL / 2, WIN_Y, z]}
            rotation-y={Math.PI / 2}
          />
        ))}
        {/* Ochre corner pilasters and black downpipes on the street front */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box
              size={[0.4, INNER, 0.08]}
              color={COLORS.ochre}
              position={[s * (W / 2 - 0.2), half, D / 2 + 0.04]}
            />
            <Box
              size={[0.1, H, 0.1]}
              color={COLORS.pipe}
              position={[s * (W / 2 + 0.1), H / 2 - 0.2, D / 2 + 0.12]}
            />
          </group>
        ))}
      </Fade>
    </>
  );
}

/** Height of the roof surface above the eaves, at depth z (front and back slopes). */
const roofAt = (z: number) => (ROOF * (D / 2 + EAVES - Math.abs(z))) / (D / 2 + EAVES);

/** A dormer on the front slope: small with an arched cap, or big with a triangular gable. */
function Dormer({ x, big = false, windows }: { x: number; big?: boolean; windows: Windows }) {
  const w = big ? 1.3 : 0.8;
  const h = big ? 1.1 : 0.8;
  const dep = 2.2;
  const z = D / 2 - 0.5;
  const y = roofAt(z);
  const cap = useMemo(() => {
    const s = new Shape();
    if (big) {
      s.moveTo(-w / 2 - 0.12, 0);
      s.lineTo(w / 2 + 0.12, 0);
      s.lineTo(0, 0.55);
      s.closePath();
    } else {
      const r = w / 2 + 0.08;
      s.moveTo(r, 0);
      s.absarc(0, 0, r, 0, Math.PI, false);
      s.closePath();
    }
    return new ExtrudeGeometry(s, { depth: dep + 0.1, bevelEnabled: false });
  }, [big, w]);
  return (
    <group position={[x, y - 0.1, z]}>
      <Box size={[w, h, dep]} color={COLORS.ochre} position={[0, h / 2, -dep / 2]} />
      <Box size={[w - 0.28, h - 0.24, 0.04]} color="#a9cbe0" position={[0, h / 2 + 0.02, 0.01]} />
      <Box
        size={[0.05, h - 0.24, 0.05]}
        color={WINDOW_LOOK[windows].frame}
        position={[0, h / 2 + 0.02, 0.04]}
      />
      <mesh geometry={cap} position={[0, h, -dep]}>
        <meshStandardMaterial color={big ? COLORS.roof : COLORS.ochre} roughness={0.8} />
      </mesh>
    </group>
  );
}

/**
 * Dark pitched roof with an overhang, ridge running left to right, three dormers on the street
 * side, a TV antenna on the ridge, an ochre cornice and a gutter. Sits on top of the upper floor.
 */
function Roof({ windows }: { windows: Windows }) {
  const geometry = useMemo(() => {
    const half = D / 2 + EAVES;
    const shape = new Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, ROOF);
    shape.closePath();
    const depth = W + 0.5;
    const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  return (
    <>
      {/* Ceiling of the upper floor, ochre at its edge like a cornice */}
      <Box size={[W + 0.2, 0.2, D + 0.2]} color={COLORS.ochre} position-y={-0.1} />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          size={[W + 0.3, 0.25, 0.3]}
          color={COLORS.ochreDark}
          position={[0, 0.02, s * (D / 2 + 0.15)]}
        />
      ))}
      <mesh geometry={geometry} position-y={0.12}>
        <meshStandardMaterial color={COLORS.roof} roughness={0.9} />
      </mesh>
      <Box
        size={[W + 0.5, 0.14, 0.16]}
        color={COLORS.pipe}
        position={[0, 0.1, D / 2 + EAVES + 0.05]}
      />
      {[-3.2, 0, 3.2].map((x) => (
        <Dormer key={x} x={x} big={x === 0} windows={windows} />
      ))}
      <group position={[1.4, ROOF + 0.1, 0]}>
        <Box size={[0.05, 2, 0.05]} color="#777777" position-y={1} />
        {[1.3, 1.6, 1.9].map((y, i) => (
          <Box key={y} size={[1.3 - i * 0.3, 0.03, 0.03]} color="#777777" position-y={y} />
        ))}
      </group>
    </>
  );
}

/** Right at the house: ochre plinth with arched cellar windows, steps, potted shrubs, railing. */
function Street() {
  const cellar = [-4.8, -3, 2.05, 4.6];
  return (
    <>
      <Box
        size={[W + 0.12, SOCLE - 0.2, D + 0.12]}
        color={COLORS.ochre}
        position-y={(SOCLE - 0.2) / 2}
      />
      {cellar.map((x) => (
        <group key={x} position={[x, 0, D / 2 + 0.07]}>
          <Box size={[0.7, 0.3, 0.02]} color="#1b1b1b" position-y={0.3} />
          <mesh position-y={0.45}>
            <circleGeometry args={[0.35, 20, 0, Math.PI]} />
            <meshStandardMaterial color="#1b1b1b" />
          </mesh>
          {[-2, -1, 0, 1, 2].map((i) => (
            <Box
              key={i}
              size={[0.02, 0.6, 0.02]}
              color="#e8e8e8"
              position={[i * 0.13, 0.45, 0.02]}
            />
          ))}
        </group>
      ))}
      {[-1, 1].map((s) => (
        <Box
          key={s}
          size={[0.1, SOCLE - 0.2, 0.1]}
          color={COLORS.pipe}
          position={[s * (W / 2 + 0.1), (SOCLE - 0.2) / 2, D / 2 + 0.12]}
        />
      ))}
      {/* Stone steps up to the door */}
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          size={[1.6 + i * 0.1, (SOCLE * (3 - i)) / 3, 0.35]}
          color={COLORS.stone}
          position={[0, (SOCLE * (3 - i)) / 6, D / 2 + 0.06 + 0.175 + i * 0.35]}
        />
      ))}
      {[
        [-4.9, 0.9],
        [-1.6, 0.7],
        [1.6, 0.7],
        [5, 0.8],
      ].map(([x = 0, s = 1]) => (
        <group key={x} position={[x, 0, D / 2 + 0.7]}>
          <Box size={[0.5, 0.4, 0.5]} color={COLORS.pot} position-y={0.2} />
          <mesh position-y={0.4 + s * 0.6}>
            <sphereGeometry args={[s * 0.6, 14, 12]} />
            <meshStandardMaterial color={COLORS.shrub} roughness={1} />
          </mesh>
        </group>
      ))}
      {/* Railing along the pavement */}
      {[-6, -4, -2, 0, 2, 4, 6].map((x) => (
        <Box key={x} size={[0.06, 1, 0.06]} color="#888888" position={[x, 0.5, D / 2 + 3.3]} />
      ))}
      <Box size={[12, 0.06, 0.06]} color="#888888" position={[0, 1, D / 2 + 3.3]} />
    </>
  );
}

// ─── What the questions change ───────────────────────────────────────────────

/** Underfloor heating: warm pipes snaking across a room's floor. */
function FloorPipes({ room, warm }: { room: Room; warm: boolean }) {
  const [x0, z0, x1, z1] = room.rect;
  const runs: number[] = [];
  for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.45) runs.push(z);
  const color = warm ? COLORS.hover : "#d9a27c";
  const len = x1 - x0 - 0.5;
  return (
    <>
      {runs.map((z, i) => (
        <group key={z}>
          <Box size={[len, 0.03, 0.07]} color={color} position={[(x0 + x1) / 2, 0.03, z]} />
          {/* A bend joining this run to the next, alternating sides */}
          {i < runs.length - 1 && (
            <Box
              size={[0.07, 0.03, 0.45]}
              color={color}
              position={[i % 2 ? x0 + 0.25 : x1 - 0.25, 0.03, z + 0.225]}
            />
          )}
        </group>
      ))}
    </>
  );
}

/** Puffs drifting up and fading: smoke from a chimney, steam from a bath. */
function Puffs({
  color,
  active,
  size = 0.35,
  ...props
}: { color: string; active: boolean; size?: number } & ThreeElements["group"]) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.visible = active;
    g.children.forEach((child, i) => {
      const t = (clock.elapsedTime * 0.45 + i / g.children.length) % 1;
      child.position.set(Math.sin(t * 5 + i) * 0.15, t * 2.2, Math.cos(t * 4 + i) * 0.1);
      child.scale.setScalar(size * (0.5 + t));
      const m = (child as unknown as { material: MeshBasicMaterial }).material;
      m.opacity = 0.55 * (1 - t);
    });
  });
  return (
    <group ref={ref} {...props}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The heat pump's fan, turning. */
function Fan({ spinning, ...props }: { spinning: boolean } & ThreeElements["group"]) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * (spinning ? 6 : 1.5);
  });
  return (
    <group ref={ref} {...props}>
      <Box size={[0.62, 0.08, 0.02]} color="#8a919b" />
      <Box size={[0.08, 0.62, 0.02]} color="#8a919b" />
    </group>
  );
}

/** What heats the house today, standing outside on the right; oil and gas get a chimney. */
function Plant({ fuel, active }: { fuel: Fuel; active: boolean }) {
  return (
    <group position={[W / 2 + 1.5, 0, -1.5]}>
      {fuel === "oil" && (
        <>
          {/* Oil tank lying down, and the boiler */}
          <mesh position={[0, 0.65, 0.9]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.6, 0.6, 1.9, 24]} />
            <meshStandardMaterial color="#5f6b52" roughness={0.6} />
          </mesh>
          <Box size={[0.8, 1.4, 0.7]} color="#e8e4dd" position={[0, 0.7, -0.9]} />
          <Box size={[0.08, 0.08, 0.9]} color="#3a3f46" position={[0, 0.3, 0]} />
        </>
      )}
      {fuel === "gas" && (
        <>
          {/* Gas boiler, fed by a yellow pipe from the meter */}
          <Box size={[0.8, 1.1, 0.5]} color="#f2efea" position={[-0.4, 1.4, 0]} />
          <Box size={[0.1, 1, 0.1]} color="#f2c230" position={[-0.4, 0.4, 0.15]} />
          <Box size={[0.5, 0.35, 0.3]} color="#f2c230" position={[0.2, 0.17, 0.15]} />
        </>
      )}
      {fuel === "heatpump" && (
        <>
          {/* Outdoor unit with its fan */}
          <Box size={[1.3, 1, 0.55]} color="#f4f2ee" position={[0, 0.5, 0]} />
          <mesh position={[0.15, 0.52, 0.28]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.36, 0.36, 0.02, 32]} />
            <meshStandardMaterial color="#2c3440" />
          </mesh>
          <Fan position={[0.15, 0.52, 0.3]} spinning={active} />
        </>
      )}
      {fuel === "electric" && (
        <>
          {/* Electric cabinet and a power pole */}
          <Box size={[0.7, 1.2, 0.35]} color="#c9c6c0" position={[0, 0.6, 0]} />
          <Box size={[0.5, 0.08, 0.02]} color="#f2c230" position={[0, 0.9, 0.18]} />
          <Box size={[0.12, 3.2, 0.12]} color="#5b4636" position={[1.2, 1.6, 0.6]} />
          <Box size={[0.8, 0.08, 0.08]} color="#5b4636" position={[1.2, 3, 0.6]} />
        </>
      )}
      {fuel === "district" && (
        <>
          {/* District heating substation: a cabinet, its flow and return pipes into the ground */}
          <Box size={[0.9, 1.1, 0.5]} color="#d9d5ce" position={[0, 0.55, 0]} />
          <Box size={[0.1, 0.7, 0.1]} color="#c8553d" position={[-0.2, 0.35, 0.3]} />
          <Box size={[0.1, 0.7, 0.1]} color="#3d6fc8" position={[0.2, 0.35, 0.3]} />
        </>
      )}
    </group>
  );
}

/** Chimney on the roof for oil and gas, smoking while the energy question is open. */
function Chimney({ fuel, smoke }: { fuel: Fuel; smoke: boolean }) {
  if (fuel !== "oil" && fuel !== "gas") return null;
  return (
    <group position={[2.8, 0, -1.6]}>
      <Box size={[0.6, 2.6, 0.6]} color="#8a6f5c" position-y={2.4} />
      <Box size={[0.75, 0.12, 0.75]} color="#6f5848" position-y={3.7} />
      <Puffs color="#9a9590" active={smoke} position-y={3.8} />
    </group>
  );
}

/** Where people stand, in floor coordinates: alternating floors as residents are added. */
const SPOTS: [FloorId, number, number][] = [
  ["ground", -3.4, 1.1],
  ["upper", -2.75, 2.1],
  ["ground", 2.5, -2.1],
  ["upper", 4.7, -1.6],
  ["ground", -1.6, -0.8],
  ["upper", -1.1, -1.6],
  ["ground", -4.1, -2.4],
  ["upper", 1.4, -0.5],
  ["ground", 0, 2.7],
  ["upper", -4.1, -0.5],
  ["ground", 2.1, 0.1],
  ["upper", 4.1, 2.4],
];
/** Distance residents keep from their room's walls, and how far they stray from their spot. */
const ROOM_MARGIN = 0.55;
const ROAM = 1.3;

/** Where a resident is, where they're heading, and how far into their stride they are. */
type Walker = {
  rand: () => number;
  next: () => [number, number];
  x: number;
  z: number;
  heading: number;
  target: [number, number];
  wait: number;
  phase: number;
  stride: number;
};

/** Starts a resident at their spot; new targets stay near it and inside the room. */
function makeWalker(index: number, [hx, hz]: [number, number], [x0, z0, x1, z1]: Rect): Walker {
  const rand = seeded(index + 1);
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  const next = (): [number, number] => [
    clamp(hx + (rand() * 2 - 1) * ROAM, x0 + ROOM_MARGIN, x1 - ROOM_MARGIN),
    clamp(hz + (rand() * 2 - 1) * ROAM, z0 + ROOM_MARGIN, z1 - ROOM_MARGIN),
  ];
  return {
    rand,
    next,
    x: hx,
    z: hz,
    heading: rand() * Math.PI * 2,
    target: next(),
    wait: rand() * 3,
    phase: 0,
    stride: 0,
  };
}

/**
 * A resident strolling around their room, swinging arms and legs while they walk and stopping
 * for a while now and then; kids are smaller and quicker.
 */
function Person({
  index,
  kid,
  home,
  room,
}: {
  index: number;
  kid: boolean;
  home: [number, number];
  room: Rect;
}) {
  const body = useRef<Group>(null);
  const rig = useRef<Rig>({ legs: [], arms: [] });
  const walker = useRef<Walker | null>(null);

  useFrame((_, delta) => {
    const g = body.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const s = (walker.current ??= makeWalker(index, home, room));
    let walking = false;
    if (s.wait > 0) s.wait -= dt;
    else {
      const dx = s.target[0] - s.x;
      const dz = s.target[1] - s.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        // Arrived: stand for a moment, then head somewhere else
        s.wait = 1.5 + s.rand() * 4;
        s.target = s.next();
      } else {
        walking = true;
        const step = Math.min(dist, (kid ? 0.75 : 0.55) * dt);
        s.x += (dx / dist) * step;
        s.z += (dz / dist) * step;
        // Turn smoothly towards where they're going (the figure faces +z)
        const goal = Math.atan2(dx, dz);
        const turn = Math.atan2(Math.sin(goal - s.heading), Math.cos(goal - s.heading));
        s.heading += turn * (1 - Math.exp(-8 * dt));
      }
    }
    s.stride = MathUtils.damp(s.stride, walking ? 1 : 0, 6, dt);
    s.phase += dt * (kid ? 9 : 7) * s.stride;
    g.position.set(s.x, Math.abs(Math.sin(s.phase)) * 0.03 * s.stride, s.z);
    g.rotation.y = s.heading;
    stride(rig.current, s.phase, s.stride);
  });

  return (
    <group ref={body} position={[home[0], 0, home[1]]}>
      <Figure index={index} kid={kid} rig={rig} />
    </group>
  );
}

/** The residents on one floor, adults first, then kids, each wandering inside their room. */
function People({ floor, adults, children }: { floor: FloorId; adults: number; children: number }) {
  const homes = useMemo(() => {
    const rooms = FLOORS.find((f) => f.id === floor)?.rooms ?? [];
    return SPOTS.map(([f, x, z]) => {
      if (f !== floor) return null;
      const room = rooms.find(
        ({ rect: [x0, z0, x1, z1] }) => x >= x0 && x <= x1 && z >= z0 && z <= z1,
      );
      return room ? { home: [x, z] as [number, number], rect: room.rect } : null;
    });
  }, [floor]);
  return (
    <>
      {homes
        .slice(0, adults + children)
        .map((h, i) =>
          h ? <Person key={i} index={i} kid={i >= adults} home={h.home} room={h.rect} /> : null,
        )}
    </>
  );
}

/** Hot water tank in the ground floor bathroom, with steam over the bath while it's in focus. */
function HotWater({ steam }: { steam: boolean }) {
  return (
    <>
      <mesh position={[5, 0.85, 1.3]}>
        <cylinderGeometry args={[0.32, 0.32, 1.7, 24]} />
        <meshStandardMaterial color="#f7f5f2" roughness={0.5} />
      </mesh>
      <mesh position={[5, 1.2, 1.3]}>
        <cylinderGeometry args={[0.33, 0.33, 0.18, 24]} />
        <meshStandardMaterial color={COLORS.hover} />
      </mesh>
      <Puffs color="#ffffff" active={steam} size={0.22} position={[3.45, 0.6, 3.4]} />
    </>
  );
}

// ─── House ───────────────────────────────────────────────────────────────────

type HouseProps = {
  /** Open floor: the camera zooms to it and the storeys above move out of the way. */
  open: FloorId | null;
  /** Hovered floor (from the 3D view or a card): the storeys above lift for a peek. */
  hover: FloorId | null;
  onHover: (id: FloorId | null) => void;
  onOpen: (id: FloorId) => void;
  /** The answers so far: the house shows windows, heating, plant and people to match. */
  answers: Answers;
  /** Part of the house the current question is about: the camera goes there. */
  focus: Focus | null;
};

/** Which floors get underfloor heating; the rest keep radiators. */
const UNDERFLOOR: Record<Emitters, FloorId[]> = {
  radiators: [],
  underfloor: ["ground", "upper"],
  mixed: ["ground"],
};

function House({ open, hover, onHover, onOpen, answers, focus }: HouseProps) {
  const levelOf = (id: FloorId | null) => FLOORS.find((f) => f.id === id)?.level ?? null;
  const openLevel = levelOf(open);
  const hoverLevel = levelOf(hover);
  // Heating and people: roof off and the first floor raised, to see into both floors
  const cutaway = openLevel === null && (focus === "heating" || focus === "people");
  const liftFor = (level: number) =>
    cutaway
      ? level === FLOORS.length
        ? 30
        : level > 0
          ? 3.4
          : 0
      : openLevel !== null
        ? level > openLevel
          ? 30
          : 0
        : hoverLevel !== null && level > hoverLevel
          ? 2.4
          : 0;

  // Looking inside: the street front and right side fade out of the way
  const see = cutaway || openLevel !== null || hoverLevel !== null;

  return (
    <>
      <Street />
      <Surroundings />
      {FLOORS.map((floor) => {
        const hot = hover === floor.id && !open;
        const events = !open && {
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(floor.id);
            document.body.style.cursor = "pointer";
          },
          onPointerOut: () => {
            onHover(null);
            document.body.style.cursor = "";
          },
          onClick: (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            // A drag to orbit isn't a click
            if (e.delta > 5) return;
            document.body.style.cursor = "";
            onOpen(floor.id);
          },
        };
        return (
          <Lift key={floor.id} y={SOCLE + floor.level * H} lift={liftFor(floor.level)} {...events}>
            <Box
              size={[W + 0.2, 0.2, D + 0.2]}
              color={hot ? COLORS.hover : COLORS.ochre}
              position-y={-0.1}
            />
            {floor.rooms.map((room) => {
              const [x0, z0, x1, z1] = room.rect;
              return (
                <group key={room.name}>
                  <mesh position={[(x0 + x1) / 2, 0.01, (z0 + z1) / 2]} rotation-x={-Math.PI / 2}>
                    <planeGeometry args={[x1 - x0 - 0.05, z1 - z0 - 0.05]} />
                    <meshStandardMaterial color={COLORS.floor[room.kind]} roughness={0.8} />
                  </mesh>
                  <Furniture
                    room={room}
                    radiator={!UNDERFLOOR[answers.emitters].includes(floor.id)}
                    warm={focus === "heating"}
                  />
                  {UNDERFLOOR[answers.emitters].includes(floor.id) && (
                    <FloorPipes room={room} warm={focus === "heating"} />
                  )}
                </group>
              );
            })}
            {floor.walls.map(([x0, z0, x1, z1]) => {
              const alongZ = x0 === x1;
              const len = alongZ ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
              return (
                <Box
                  key={`${x0},${z0},${x1},${z1}`}
                  size={alongZ ? [0.1, INNER, len] : [len, INNER, 0.1]}
                  color={COLORS.wall}
                  position={[(x0 + x1) / 2, INNER / 2, (z0 + z1) / 2]}
                />
              );
            })}
            <Walls
              floor={floor.id}
              windows={answers.windows}
              glow={focus === "windows"}
              see={see}
            />
            <People floor={floor.id} adults={answers.adults} children={answers.children} />
            {floor.id === "ground" && <HotWater steam={focus === "people"} />}
          </Lift>
        );
      })}
      {/* The roof sits on the top floor, so it moves with it */}
      <Lift y={SOCLE + FLOORS.length * H} lift={liftFor(FLOORS.length)}>
        <Roof windows={answers.windows} />
        <Chimney fuel={answers.fuel} smoke={focus === "energy"} />
      </Lift>
      <Plant fuel={answers.fuel} active={focus === "energy"} />
    </>
  );
}

/** The demo house in 3D on a transparent canvas: orbit by drag, click a floor to zoom in. */
export function HouseScene(props: HouseProps) {
  const compact = useCompact();
  const level = FLOORS.find((f) => f.id === props.open)?.level;
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [34, 30, 30], fov: 35 }}
      onCreated={({ gl }) => {
        // Passing vehicles are cut off at the edges of the neighbourhood tile
        gl.localClippingEnabled = true;
      }}
    >
      <hemisphereLight args={["#ffffff", "#d8d4cc", 1.6]} />
      <directionalLight position={[8, 14, 10]} intensity={2.2} />
      <Camera
        compact={compact}
        {...(level !== undefined
          ? floorFraming(level)
          : props.focus
            ? FOCUS_FRAMING[props.focus]
            : HOUSE_FRAMING)}
      />
      <House {...props} />
    </Canvas>
  );
}
