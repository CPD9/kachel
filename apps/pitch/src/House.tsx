import {
  Canvas,
  useFrame,
  useThree,
  type ThreeElements,
  type ThreeEvent,
} from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  ExtrudeGeometry,
  type Group,
  MathUtils,
  type MeshBasicMaterial,
  Shape,
  Spherical,
  Vector3,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Answers, Emitters, Fuel, Windows } from "./sizing";

/** Floor-to-floor height, and the clear height of a room below the next slab. */
const H = 2.8;
const INNER = 2.6;
/** Footprint: x from -W/2 to W/2, z from -D/2 to D/2. */
const W = 8;
const D = 6;
const WALL = 0.2;

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
      { name: "Living room", kind: "living", rect: [-4, -3, 1, 3], area: 80 },
      { name: "Kitchen", kind: "kitchen", rect: [1, -3, 4, 0.5], area: 40 },
      { name: "Bathroom", kind: "bath", rect: [1, 0.5, 4, 3], area: 30 },
    ],
    walls: [
      [1, -3, 1, 3],
      [1, 0.5, 4, 0.5],
    ],
  },
  {
    id: "upper",
    level: 1,
    name: "First floor",
    area: 150,
    rooms: [
      { name: "Bedroom", kind: "bedroom", rect: [-4, -3, 0, 3], area: 65 },
      { name: "Kids' room", kind: "bedroom", rect: [0, -3, 4, 0.5], area: 50 },
      { name: "Bathroom", kind: "bath", rect: [0, 0.5, 4, 3], area: 35 },
    ],
    walls: [
      [0, -3, 0, 3],
      [0, 0.5, 4, 0.5],
    ],
  },
];

const COLORS = {
  ground: "#dcdad5",
  slab: "#d6d0c6",
  wall: "#ece7df",
  glass: "#ece7df",
  window: "#2c3440",
  roof: "#b4440f",
  hover: "#ea580c",
  furniture: "#8a8178",
  radiator: "#f5f2ee",
  floor: { living: "#9c7656", bedroom: "#a8835f", kitchen: "#c9c6c0", bath: "#b9c3c8" },
} as const;

/** Where the camera looks: a target, how far away, how steep, and from which side. */
type Framing = { target: Vec3; distance: number; polar: number; azimuth?: number };
const HOUSE_FRAMING: Framing = { target: [0, 3.2, 0], distance: 26, polar: 1.1, azimuth: 0.7 };
const floorFraming = (level: number): Framing => ({
  target: [0, level * H + 0.6, 0],
  distance: 13,
  polar: 0.78,
  azimuth: 0.6,
});
/** Roof off, first floor lifted: looking into both floors from above. */
const CUTAWAY_FRAMING: Framing = { target: [0, 2.4, 0], distance: 20, polar: 0.9, azimuth: 0.6 };
/** Outside on the right: the heating plant beside the house and the chimney. */
const PLANT_FRAMING: Framing = {
  target: [4.5, 2.6, -0.5],
  distance: 17,
  polar: 1.12,
  azimuth: 1.05,
};
/** The part of the house a question is about. */
export type Focus = "windows" | "heating" | "energy" | "people";
/** From outside, behind the house: the back wall with its windows on both floors. */
const WINDOWS_FRAMING: Framing = {
  target: [0, H, -D / 2],
  distance: 13,
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

/** Orbit by drag, and glide to a new framing when it changes (as in baselhack_2026_adobe's Venue). */
function Camera({ target, distance, polar, azimuth }: Framing) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls>(null);
  const goal = useRef<{ target: Vector3; position: Vector3 } | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    Object.assign(c, {
      enableDamping: true,
      enablePan: false,
      minDistance: 6,
      maxDistance: 40,
      maxPolarAngle: 1.45,
    });
    c.target.set(0, 2.8, 0);
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl]);
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

function Box({ size, color, ...props }: { size: Vec3; color: string } & ThreeElements["mesh"]) {
  return (
    <mesh {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
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
const WIN_H = 1.2;

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
    <mesh position-z={z}>
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

/**
 * One window, built facing +z and turned into its wall: a dark opening, one to three layers of
 * glass, a frame (old wood with glazing bars, white, or slim anthracite) and a sill.
 */
function Window({
  type,
  w,
  glow,
  ...props
}: { type: Windows; w: number; glow: boolean } & ThreeElements["group"]) {
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
      <Box
        size={[w + 0.16, 0.05, depth + 0.08]}
        color="#cfc8bd"
        position={[0, -WIN_H / 2 - 0.03, mid + 0.04]}
      />
      <HeatLeak w={w} z={back + depth + 0.08} strength={glow ? look.leak : 0} />
    </group>
  );
}

/** Outer walls: solid at the back and left with windows, see-through at the front and right. */
function Walls({ windows, glow }: { windows: Windows; glow: boolean }) {
  const half = INNER / 2;
  return (
    <>
      <Box size={[W, INNER, WALL]} color={COLORS.wall} position={[0, half, -D / 2 + WALL / 2]} />
      <Box size={[WALL, INNER, D]} color={COLORS.wall} position={[-W / 2 + WALL / 2, half, 0]} />
      {[-2.4, 0, 2.4].map((x) => (
        <Window
          key={x}
          type={windows}
          w={1.1}
          glow={glow}
          position={[x, 1.5, -D / 2 + WALL / 2]}
          rotation-y={Math.PI}
        />
      ))}
      <Window
        type={windows}
        w={1.4}
        glow={glow}
        position={[-W / 2 + WALL / 2, 1.5, 0]}
        rotation-y={-Math.PI / 2}
      />
      {/* Front and right: a low sill and a faint pane, so you can look in */}
      {[
        { size: [W, INNER, 0.05] as Vec3, position: [0, half, D / 2] as Vec3 },
        { size: [0.05, INNER, D] as Vec3, position: [W / 2, half, 0] as Vec3 },
      ].map(({ size, position }) => (
        <mesh key={position.join()} position={position}>
          <boxGeometry args={size} />
          <meshStandardMaterial
            color={COLORS.glass}
            transparent
            opacity={0.12}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

/** Pitched roof: a triangle extruded along the house, ridge running left to right. */
function Roof() {
  const geometry = useMemo(() => {
    const span = D + 0.8;
    const shape = new Shape();
    shape.moveTo(-span / 2, 0);
    shape.lineTo(span / 2, 0);
    shape.lineTo(0, 2.3);
    shape.closePath();
    const depth = W + 0.6;
    const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={COLORS.roof} roughness={0.9} />
    </mesh>
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
    <group position={[W / 2 + 1.3, 0, -1]}>
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
    </group>
  );
}

/** Chimney on the roof for oil and gas, smoking while the energy question is open. */
function Chimney({ fuel, smoke }: { fuel: Fuel; smoke: boolean }) {
  if (fuel !== "oil" && fuel !== "gas") return null;
  return (
    <group position={[2.5, 0, -1.2]}>
      <Box size={[0.55, 2.2, 0.55]} color="#8a6f5c" position-y={1.4} />
      <Puffs color="#9a9590" active={smoke} position-y={2.6} />
    </group>
  );
}

/** Where people stand, in floor coordinates: alternating floors as residents are added. */
const SPOTS: [FloorId, number, number][] = [
  ["ground", -2.5, 0.8],
  ["upper", -2, 1.6],
  ["ground", 1.8, -1.6],
  ["upper", 3.4, -1.2],
  ["ground", -1.2, -0.6],
  ["upper", -0.8, -1.2],
  ["ground", -3, -1.8],
  ["upper", 1, -0.4],
  ["ground", 0, 2],
  ["upper", -3, -0.4],
  ["ground", 1.5, 0.1],
  ["upper", 3, 1.8],
];
const SHIRTS = ["#ea580c", "#3b6ea5", "#5f8f5a", "#b4440f", "#7a5aa5", "#c79a2e"];

/** A simple person: a body and a head; every third one is a smaller kid. */
function Person({ index, ...props }: { index: number } & ThreeElements["group"]) {
  return (
    <group scale={index % 3 === 2 ? 0.7 : 1} {...props}>
      <mesh position-y={0.55}>
        <capsuleGeometry args={[0.2, 0.6, 4, 12]} />
        <meshStandardMaterial
          color={SHIRTS[index % SHIRTS.length] ?? COLORS.hover}
          roughness={0.7}
        />
      </mesh>
      <mesh position-y={1.22}>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshStandardMaterial color="#e8c4a2" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** The residents standing on one floor. */
function People({ floor, residents }: { floor: FloorId; residents: number }) {
  return (
    <>
      {SPOTS.slice(0, residents).map(([f, x, z], i) =>
        f === floor ? <Person key={i} index={i} position={[x, 0, z]} /> : null,
      )}
    </>
  );
}

/** Hot water tank in the ground floor bathroom, with steam over the bath while it's in focus. */
function HotWater({ steam }: { steam: boolean }) {
  return (
    <>
      <mesh position={[3.5, 0.85, 0.95]}>
        <cylinderGeometry args={[0.32, 0.32, 1.7, 24]} />
        <meshStandardMaterial color="#f7f5f2" roughness={0.5} />
      </mesh>
      <mesh position={[3.5, 1.2, 0.95]}>
        <cylinderGeometry args={[0.33, 0.33, 0.18, 24]} />
        <meshStandardMaterial color={COLORS.hover} />
      </mesh>
      <Puffs color="#ffffff" active={steam} size={0.22} position={[2.5, 0.6, 2.4]} />
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

  return (
    <>
      <mesh position-y={-0.2} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[11, 64]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>
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
          <Lift key={floor.id} y={floor.level * H} lift={liftFor(floor.level)} {...events}>
            <Box
              size={[W + 0.2, 0.2, D + 0.2]}
              color={hot ? COLORS.hover : COLORS.slab}
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
            <Walls windows={answers.windows} glow={focus === "windows"} />
            <People floor={floor.id} residents={answers.residents} />
            {floor.id === "ground" && answers.hotWater && <HotWater steam={focus === "people"} />}
          </Lift>
        );
      })}
      {/* The roof sits on the top floor, so it moves with it */}
      <Lift y={FLOORS.length * H} lift={liftFor(FLOORS.length)}>
        <Roof />
        <Chimney fuel={answers.fuel} smoke={focus === "energy"} />
      </Lift>
      <Plant fuel={answers.fuel} active={focus === "energy"} />
    </>
  );
}

/** The demo house in 3D on a transparent canvas: orbit by drag, click a floor to zoom in. */
export function HouseScene(props: HouseProps) {
  const level = FLOORS.find((f) => f.id === props.open)?.level;
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [34, 30, 30], fov: 35 }}>
      <hemisphereLight args={["#ffffff", "#d8d4cc", 1.6]} />
      <directionalLight position={[8, 14, 10]} intensity={2.2} />
      <Camera
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
