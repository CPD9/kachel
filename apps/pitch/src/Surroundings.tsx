import { type ThreeElements, useFrame } from "@react-three/fiber";
import { type ReactNode, type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import {
  DoubleSide,
  ExtrudeGeometry,
  type Group,
  MathUtils,
  Mesh,
  Plane,
  Shape,
  Vector3,
} from "three";
import { Figure, type Rig, seeded, stride } from "./Figure";

/**
 * The neighbourhood around the demo house, as a square diorama tile: a Basel street in front with
 * a green tram, parked and passing cars, a cyclist, people walking a dog, street lamps and trees;
 * neighbouring townhouses on the left and behind; a back garden with a swing, laundry and an apple
 * tree; a park strip with a fountain across the street; and birds circling overhead.
 *
 * Laid out around the 11 × 8 m house at the origin, its street front facing +z.
 */

type Vec3 = [number, number, number];

/** The tile: x from -TILE_X to TILE_X, z from BACK to FRONT. */
const TILE_X = 22;
const BACK = -15;
const FRONT = 21;
/** Street cross-section, front of the house outwards (z). */
const NEAR_CURB = 7.6;
const PARKING = 8.5;
const RAIL = 10.8;
const LANE_LINE = 12.2;
const CAR_LANE = 13.5;
const BIKE_LANE = 15.15;
const FAR_CURB = 15.6;
const PARK_EDGE = 18.5;

const C = {
  lawn: "#86a35c",
  earth: "#7d6450",
  pavement: "#b3aca0",
  asphalt: "#56595e",
  groove: "#47494d",
  marking: "#e6e3dc",
  bikeLane: "#9c5a4c",
  curb: "#c9c4ba",
  hedge: "#3f5f2c",
  wood: "#9b7b5b",
  stone: "#a59d90",
  water: "#8fc3d6",
  tram: "#3f8f46",
  glass: "#2c3a44",
  lampPost: "#2f3b33",
  lamp: "#ffe2b0",
} as const;

/** Vehicles leave the tile through its side edges: anything beyond them is cut away. */
const EDGES = [new Plane(new Vector3(1, 0, 0), TILE_X), new Plane(new Vector3(-1, 0, 0), TILE_X)];

function Box({
  size,
  color,
  glow,
  ...props
}: { size: Vec3; color: string; glow?: boolean } & ThreeElements["mesh"]) {
  return (
    <mesh {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        emissive={glow ? color : "#000000"}
        emissiveIntensity={glow ? 0.9 : 0}
      />
    </mesh>
  );
}

/** A flat strip on the ground: x0..x1 by z0..z1, lifted by `y` to stack without flicker. */
function Flat({
  x0 = -TILE_X,
  x1 = TILE_X,
  z0,
  z1,
  y,
  color,
}: {
  x0?: number;
  x1?: number;
  z0: number;
  z1: number;
  y: number;
  color: string;
}) {
  return (
    <mesh position={[(x0 + x1) / 2, y, (z0 + z1) / 2]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/** Cuts its children off at the tile's sides, so vehicles slide in and out of the diorama. */
function Clipped({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) m.clippingPlanes = EDGES;
    });
  });
  return <group ref={ref}>{children}</group>;
}

// ─── Ground and street ───────────────────────────────────────────────────────

function Ground() {
  const depth = FRONT - BACK;
  const crossing = Array.from({ length: 8 }, (_, i) => NEAR_CURB + 0.5 + i);
  const dashes = Array.from({ length: 15 }, (_, i) => -21 + i * 3);
  return (
    <>
      {/* The tile itself: lawn on top, earth at the sides */}
      <mesh position={[0, -0.3, (BACK + FRONT) / 2]}>
        <boxGeometry args={[TILE_X * 2, 0.6, depth]} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <meshStandardMaterial
            key={i}
            attach={`material-${i}`}
            color={i === 2 ? C.lawn : C.earth}
            roughness={1}
          />
        ))}
      </mesh>
      {/* Pavements, road, tram track, bike lane */}
      <Flat z0={4} z1={NEAR_CURB} y={0.01} color={C.pavement} />
      <Flat z0={FAR_CURB} z1={PARK_EDGE} y={0.01} color={C.pavement} />
      <Flat z0={NEAR_CURB} z1={FAR_CURB} y={0.008} color={C.asphalt} />
      <Flat z0={RAIL - 0.95} z1={RAIL + 0.95} y={0.012} color={C.groove} />
      {[-0.72, 0.72].map((dz) => (
        <Flat key={dz} z0={RAIL + dz - 0.04} z1={RAIL + dz + 0.04} y={0.016} color="#a3a3a3" />
      ))}
      <Flat z0={BIKE_LANE - 0.4} z1={FAR_CURB - 0.05} y={0.012} color={C.bikeLane} />
      <Flat z0={BIKE_LANE - 0.44} z1={BIKE_LANE - 0.38} y={0.016} color={C.marking} />
      <Flat z0={PARKING + 0.9} z1={PARKING + 0.96} y={0.016} color={C.marking} />
      {dashes.map((x) => (
        <Flat
          key={x}
          x0={x}
          x1={x + 1.5}
          z0={LANE_LINE - 0.05}
          z1={LANE_LINE + 0.05}
          y={0.016}
          color={C.marking}
        />
      ))}
      {/* Zebra crossing between the houses */}
      {crossing.map((z) => (
        <Flat key={z} x0={-10.5} x1={-7.5} z0={z - 0.22} z1={z + 0.22} y={0.02} color={C.marking} />
      ))}
      {/* Curbs */}
      {[NEAR_CURB, FAR_CURB].map((z) => (
        <Box key={z} size={[TILE_X * 2, 0.12, 0.18]} color={C.curb} position={[0, 0.06, z]} />
      ))}
      {/* Gravel passage between our house and the neighbour */}
      <Flat x0={-7.8} x1={-5.6} z0={-4} z1={4} y={0.01} color="#bdb3a2" />
    </>
  );
}

/** Overhead line for the tram: poles on the far pavement, arms reaching over the track. */
function TramLine() {
  return (
    <>
      {[-17, -3, 11].map((x) => (
        <group key={x} position={[x, 0, FAR_CURB + 0.3]}>
          <Box size={[0.16, 6.8, 0.16]} color={C.lampPost} position-y={3.4} />
          <Box
            size={[0.08, 0.08, FAR_CURB + 0.3 - RAIL + 0.3]}
            color={C.lampPost}
            position={[0, 6.5, -(FAR_CURB + 0.3 - RAIL) / 2]}
          />
        </group>
      ))}
      <Box size={[TILE_X * 2, 0.025, 0.025]} color="#333333" position={[0, 6.1, RAIL]} />
    </>
  );
}

/** A street lamp with a warm glowing head, its arm reaching towards the road (+z or -z). */
function Lamp({ x, z, toward }: { x: number; z: number; toward: 1 | -1 }) {
  return (
    <group position={[x, 0, z]}>
      <Box size={[0.3, 0.3, 0.3]} color={C.lampPost} position-y={0.15} />
      <Box size={[0.1, 4.6, 0.1]} color={C.lampPost} position-y={2.3} />
      <Box size={[0.08, 0.08, 1]} color={C.lampPost} position={[0, 4.55, toward * 0.45]} />
      <Box size={[0.4, 0.16, 0.3]} color={C.lampPost} position={[0, 4.45, toward * 0.9]} />
      <Box size={[0.32, 0.05, 0.24]} color={C.lamp} glow position={[0, 4.36, toward * 0.9]} />
    </group>
  );
}

// ─── Buildings and gardens ───────────────────────────────────────────────────

type TownhouseLook = {
  width: number;
  floors: number;
  render: string;
  trim: string;
  shutter: string;
  roof: string;
  door: string;
};

/** A neighbouring townhouse: plinth, rendered storeys with shuttered windows, pitched roof. */
function Townhouse({ look, ...props }: { look: TownhouseLook } & ThreeElements["group"]) {
  const { width, floors, render, trim, shutter, roof, door } = look;
  const depth = 8;
  const storey = 2.9;
  const base = 0.9;
  const top = base + floors * storey;
  const bays = Math.max(2, Math.round(width / 2.2));
  const spacing = width / bays;
  const front = depth / 2;
  const roofGeometry = useMemo(() => {
    const half = depth / 2 + 0.35;
    const s = new Shape();
    s.moveTo(-half, 0);
    s.lineTo(half, 0);
    s.lineTo(0, 3);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: width + 0.2, bevelEnabled: false });
    g.translate(0, 0, -(width + 0.2) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, [width]);
  return (
    <group {...props}>
      <Box size={[width, base, depth]} color={trim} position-y={base / 2} />
      <Box
        size={[width - 0.02, top - base, depth - 0.02]}
        color={render}
        position-y={(base + top) / 2}
      />
      {Array.from({ length: floors - 1 }, (_, f) => (
        <Box
          key={f}
          size={[width, 0.14, 0.08]}
          color={trim}
          position={[0, base + (f + 1) * storey, front + 0.04]}
        />
      ))}
      <Box size={[width + 0.2, 0.25, depth + 0.2]} color={trim} position-y={top + 0.1} />
      {Array.from({ length: floors }, (_, f) =>
        Array.from({ length: bays }, (_, b) => {
          const x = -width / 2 + spacing * (b + 0.5);
          const y = base + f * storey + 1.5;
          if (f === 0 && b === Math.floor(bays / 2))
            return (
              <group key={`${f}-${b}`} position={[x, base, front]}>
                <Box size={[1.3, 2.5, 0.06]} color={trim} position={[0, 1.2, 0.02]} />
                <Box size={[1, 2.2, 0.06]} color={door} position={[0, 1.1, 0.05]} />
                <Box size={[1.4, base, 0.5]} color={C.stone} position={[0, -base / 2, 0.25]} />
              </group>
            );
          return (
            <group key={`${f}-${b}`} position={[x, y, front]}>
              <Box size={[1.2, 1.75, 0.04]} color={trim} position-z={0.01} />
              <Box size={[0.95, 1.5, 0.05]} color={C.glass} position-z={0.03} />
              <Box size={[0.05, 1.5, 0.06]} color={trim} position-z={0.05} />
              {[-1, 1].map((s) => (
                <Box
                  key={s}
                  size={[0.47, 1.5, 0.04]}
                  color={shutter}
                  position={[s * 0.85, 0, 0.04]}
                />
              ))}
            </group>
          );
        }),
      )}
      <mesh geometry={roofGeometry} position-y={top + 0.2}>
        <meshStandardMaterial color={roof} roughness={0.9} />
      </mesh>
      <Box size={[0.5, 1.6, 0.5]} color="#8a6f5c" position={[width / 4, top + 2.4, -1.5]} />
    </group>
  );
}

/** A tree on a trunk, its crown swaying gently in the wind. */
function Tree({
  x,
  z,
  size = 1,
  seed = 0,
  fruit = false,
}: {
  x: number;
  z: number;
  size?: number;
  seed?: number;
  fruit?: boolean;
}) {
  const crown = useRef<Group>(null);
  const greens = ["#4f7a35", "#5b8a3c", "#46703a", "#6a9445"];
  const rand = seeded(seed + 11);
  const blobs: { p: Vec3; r: number; c: string }[] = Array.from({ length: 4 }, (_, i) => ({
    p: [(rand() - 0.5) * 1.4, 0.2 + rand() * 1.1, (rand() - 0.5) * 1.4],
    r: 0.9 + rand() * 0.5,
    c: greens[(seed + i) % greens.length] ?? C.hedge,
  }));
  const apples: Vec3[] = fruit
    ? Array.from({ length: 10 }, () => {
        const a = rand() * Math.PI * 2;
        return [Math.cos(a) * 1.3, 0.2 + rand() * 1.2, Math.sin(a) * 1.3];
      })
    : [];
  useFrame(({ clock }) => {
    const g = crown.current;
    if (!g) return;
    const t = clock.elapsedTime * 0.9 + seed;
    g.rotation.z = Math.sin(t) * 0.035;
    g.rotation.x = Math.sin(t * 0.7) * 0.025;
  });
  return (
    <group position={[x, 0, z]} scale={size}>
      <mesh position-y={1.2}>
        <cylinderGeometry args={[0.14, 0.2, 2.4, 8]} />
        <meshStandardMaterial color="#6b4f3a" roughness={1} />
      </mesh>
      <group ref={crown} position-y={2.6}>
        {blobs.map((b, i) => (
          <mesh key={i} position={b.p}>
            <icosahedronGeometry args={[b.r, 1]} />
            <meshStandardMaterial color={b.c} roughness={1} flatShading />
          </mesh>
        ))}
        {apples.map((p, i) => (
          <mesh key={`a${i}`} position={p}>
            <sphereGeometry args={[0.09, 8, 6]} />
            <meshStandardMaterial color="#c0392b" roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A clipped hedge, x0..x1 at depth z. */
function Hedge({
  x0,
  x1,
  z,
  height = 1.1,
}: {
  x0: number;
  x1: number;
  z: number;
  height?: number;
}) {
  return (
    <Box size={[x1 - x0, height, 0.6]} color={C.hedge} position={[(x0 + x1) / 2, height / 2, z]} />
  );
}

/** A wooden fence along z (at x) or along x (at z), from a to b. */
function Fence({ along, at, a, b }: { along: "x" | "z"; at: number; a: number; b: number }) {
  const len = b - a;
  const posts = Array.from({ length: Math.floor(len / 1.5) + 1 }, (_, i) => a + i * 1.5);
  const place = (u: number, y: number): Vec3 => (along === "x" ? [u, y, at] : [at, y, u]);
  const rail: Vec3 = along === "x" ? [len, 0.07, 0.04] : [0.04, 0.07, len];
  return (
    <>
      {posts.map((u) => (
        <Box key={u} size={[0.09, 1.1, 0.09]} color={C.wood} position={place(u, 0.55)} />
      ))}
      {[0.4, 0.9].map((y) => (
        <Box key={y} size={rail} color={C.wood} position={place((a + b) / 2, y)} />
      ))}
    </>
  );
}

/** A swing set in the back garden, its seat swinging back and forth. */
function Swing(props: ThreeElements["group"]) {
  const seat = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (seat.current) seat.current.rotation.x = Math.sin(clock.elapsedTime * 1.7) * 0.55;
  });
  return (
    <group {...props}>
      {[-1, 1].map((s) =>
        [-1, 1].map((t) => (
          <Box
            key={`${s}${t}`}
            size={[0.08, 2.4, 0.08]}
            color={C.wood}
            position={[s * 0.95, 1.15, t * 0.45]}
            rotation-x={t * -0.2}
          />
        )),
      )}
      <Box size={[2.1, 0.1, 0.1]} color={C.wood} position-y={2.3} />
      <group ref={seat} position-y={2.28}>
        {[-0.22, 0.22].map((x) => (
          <Box key={x} size={[0.02, 1.75, 0.02]} color="#555555" position={[x, -0.88, 0]} />
        ))}
        <Box size={[0.55, 0.05, 0.25]} color="#d9534f" position-y={-1.77} />
      </group>
    </group>
  );
}

/** A washing line with clothes flapping in the breeze. */
function Laundry(props: ThreeElements["group"]) {
  const clothes = useRef<Group>(null);
  const items = [
    { x: -1.5, w: 0.7, h: 0.9, c: "#f4f2ee" },
    { x: -0.6, w: 0.55, h: 0.7, c: "#3b6ea5" },
    { x: 0.2, w: 0.6, h: 0.55, c: "#e8a0b4" },
    { x: 1.0, w: 0.5, h: 0.8, c: "#f2c230" },
    { x: 1.7, w: 0.45, h: 0.45, c: "#f4f2ee" },
  ];
  useFrame(({ clock }) => {
    clothes.current?.children.forEach((c, i) => {
      c.rotation.x = Math.sin(clock.elapsedTime * 2.2 + i * 0.9) * 0.28 - 0.1;
    });
  });
  return (
    <group {...props}>
      {[-2.2, 2.2].map((x) => (
        <Box key={x} size={[0.08, 1.9, 0.08]} color="#7a7a7a" position={[x, 0.95, 0]} />
      ))}
      <Box size={[4.4, 0.015, 0.015]} color="#dddddd" position-y={1.82} />
      <group ref={clothes}>
        {items.map(({ x, w, h, c }) => (
          <group key={x} position={[x, 1.8, 0]}>
            <mesh position-y={-h / 2}>
              <planeGeometry args={[w, h]} />
              <meshStandardMaterial color={c} side={DoubleSide} roughness={0.9} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** A table under an orange parasol, with two chairs. */
function Patio(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      <mesh position-y={0.74}>
        <cylinderGeometry args={[0.55, 0.55, 0.05, 20]} />
        <meshStandardMaterial color="#f4f2ee" />
      </mesh>
      <Box size={[0.06, 2.3, 0.06]} color="#777777" position-y={1.15} />
      <mesh position-y={2.15}>
        <coneGeometry args={[1.3, 0.5, 8, 1, true]} />
        <meshStandardMaterial color="#e8743b" side={DoubleSide} roughness={0.8} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.9, 0, 0]} rotation-y={(s * Math.PI) / 2}>
          <Box size={[0.45, 0.05, 0.45]} color={C.wood} position-y={0.45} />
          <Box size={[0.45, 0.5, 0.05]} color={C.wood} position={[0, 0.7, -0.2]} />
          {[-1, 1].map((a) =>
            [-1, 1].map((b) => (
              <Box
                key={`${a}${b}`}
                size={[0.04, 0.45, 0.04]}
                color={C.wood}
                position={[a * 0.19, 0.22, b * 0.19]}
              />
            )),
          )}
        </group>
      ))}
    </group>
  );
}

/** A raised vegetable bed with a row of greens. */
function VegBed(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      <Box size={[2, 0.4, 1]} color={C.wood} position-y={0.2} />
      <Box size={[1.85, 0.02, 0.85]} color="#5a3f2b" position-y={0.41} />
      {[-0.7, -0.35, 0, 0.35, 0.7].map((x) =>
        [-0.2, 0.2].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.5, z]}>
            <icosahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color="#6aa84f" flatShading />
          </mesh>
        )),
      )}
    </group>
  );
}

/** A garden shed with a sloped roof. */
function Shed(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      <Box size={[2, 2, 1.6]} color="#8b6a4e" position-y={1} />
      <Box size={[2.3, 0.1, 2]} color="#3a3532" position-y={2.1} rotation-x={0.15} />
      <Box size={[0.8, 1.6, 0.04]} color="#6b4f3a" position={[0.3, 0.8, 0.81]} />
    </group>
  );
}

/** Wheelie bins, as left out in the passage. */
function Bins(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      {[
        { x: 0, c: "#3c6e47" },
        { x: 0.7, c: "#4a4d52" },
      ].map(({ x, c }) => (
        <group key={x} position-x={x}>
          <Box size={[0.58, 1, 0.7]} color={c} position-y={0.5} />
          <Box size={[0.62, 0.06, 0.76]} color={c} position-y={1.03} />
        </group>
      ))}
    </group>
  );
}

/** A park bench, facing +z. */
function Bench(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      <Box size={[1.6, 0.06, 0.45]} color={C.wood} position-y={0.45} />
      <Box size={[1.6, 0.4, 0.05]} color={C.wood} position={[0, 0.72, -0.22]} />
      {[-0.7, 0.7].map((x) => (
        <Box key={x} size={[0.06, 0.45, 0.45]} color="#3a3a3a" position={[x, 0.22, 0]} />
      ))}
    </group>
  );
}

/** A Basel street fountain: stone trough, column and a spout splashing into the water. */
function Fountain(props: ThreeElements["group"]) {
  const drops = useRef<Group>(null);
  useFrame(({ clock }) => {
    drops.current?.children.forEach((d, i, all) => {
      const t = (clock.elapsedTime * 1.4 + i / all.length) % 1;
      d.position.set(0.25 + t * 0.55, 1.25 - t * t * 0.7, 0);
    });
  });
  return (
    <group {...props}>
      <mesh position-y={0.32}>
        <cylinderGeometry args={[0.95, 1, 0.64, 24]} />
        <meshStandardMaterial color={C.stone} roughness={0.9} />
      </mesh>
      <mesh position-y={0.62}>
        <cylinderGeometry args={[0.85, 0.85, 0.04, 24]} />
        <meshStandardMaterial color={C.water} roughness={0.2} />
      </mesh>
      <mesh position-y={0.95}>
        <cylinderGeometry args={[0.16, 0.2, 1.9, 12]} />
        <meshStandardMaterial color={C.stone} roughness={0.9} />
      </mesh>
      <Box size={[0.3, 0.05, 0.05]} color="#6f7a6a" position={[0.15, 1.27, 0]} />
      <group ref={drops}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.035, 6, 5]} />
            <meshStandardMaterial color={C.water} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A tram stop: glass shelter with a bench and the green stop sign. */
function TramStop(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      {[-1.4, 1.4].map((x) => (
        <Box key={x} size={[0.08, 2.4, 0.08]} color="#5a5f63" position={[x, 1.2, 0.4]} />
      ))}
      <Box size={[3, 0.1, 1.3]} color="#5a5f63" position={[0, 2.42, 0]} />
      <mesh position={[0, 1.25, 0.6]}>
        <boxGeometry args={[2.9, 2.2, 0.03]} />
        <meshStandardMaterial color="#cfe3ea" transparent opacity={0.35} />
      </mesh>
      <Box size={[2, 0.06, 0.4]} color={C.wood} position={[0, 0.48, 0.3]} />
      <Box size={[0.07, 2.8, 0.07]} color="#5a5f63" position={[2, 1.4, -0.3]} />
      <Box size={[0.6, 0.6, 0.05]} color={C.tram} position={[2, 2.7, -0.3]} />
      <Box size={[0.4, 0.14, 0.06]} color="#f4f2ee" position={[2, 2.75, -0.3]} />
    </group>
  );
}

// ─── Vehicles ────────────────────────────────────────────────────────────────

/** A car facing +x; `wheels` lets a moving car spin them. */
function Car({
  color,
  wheels,
  ...props
}: { color: string; wheels?: RefObject<Group | null> } & ThreeElements["group"]) {
  return (
    <group {...props}>
      {/* Body (y 0.275–0.925), then the cabin stacked on top with no overlapping volumes:
          glass band between the two pillars, roof resting on all three. */}
      <Box size={[4.1, 0.65, 1.75]} color={color} position-y={0.6} />
      <Box size={[2.04, 0.475, 1.6]} color={C.glass} position={[-0.25, 1.1625, 0]} />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          size={[0.08, 0.475, 1.6]}
          color={color}
          position={[-0.25 + s * 1.06, 1.1625, 0]}
        />
      ))}
      <Box size={[2.2, 0.08, 1.6]} color={color} position={[-0.25, 1.44, 0]} />
      {[-0.55, 0.55].map((z) => (
        <group key={z}>
          <Box size={[0.05, 0.14, 0.32]} color="#fff6d8" glow position={[2.075, 0.7, z]} />
          <Box size={[0.05, 0.12, 0.3]} color="#c0392b" glow position={[-2.075, 0.72, z]} />
        </group>
      ))}
      <group ref={wheels ?? null}>
        {[-1.35, 1.35].map((x) =>
          [-0.86, 0.86].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.33, z]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.33, 0.33, 0.24, 14]} />
              <meshStandardMaterial color="#1e1e1e" roughness={0.9} />
            </mesh>
          )),
        )}
      </group>
    </group>
  );
}

/** A bicycle facing +x: two wheels, frame, saddle and handlebar. */
function Bike({
  color,
  wheels,
  ...props
}: { color: string; wheels?: RefObject<Group | null> } & ThreeElements["group"]) {
  return (
    <group {...props}>
      <group ref={wheels ?? null}>
        {[-0.52, 0.52].map((x) => (
          <mesh key={x} position={[x, 0.35, 0]}>
            <torusGeometry args={[0.33, 0.03, 6, 20]} />
            <meshStandardMaterial color="#1e1e1e" />
          </mesh>
        ))}
      </group>
      <Box size={[0.95, 0.04, 0.04]} color={color} position={[0, 0.62, 0]} rotation-z={-0.08} />
      <Box size={[0.04, 0.55, 0.04]} color={color} position={[-0.15, 0.6, 0]} rotation-z={0.3} />
      <Box size={[0.65, 0.04, 0.04]} color={color} position={[0.2, 0.45, 0]} rotation-z={0.55} />
      <Box size={[0.04, 0.45, 0.04]} color={color} position={[0.5, 0.62, 0]} rotation-z={-0.25} />
      <Box size={[0.22, 0.05, 0.1]} color="#222222" position={[-0.22, 0.92, 0]} />
      <Box size={[0.04, 0.04, 0.5]} color="#222222" position={[0.56, 0.9, 0]} />
    </group>
  );
}

/**
 * The green Basel tram: two articulated sections with a window band and pantograph, gliding
 * along the track every so often, alternating direction.
 */
function Tram() {
  const ref = useRef<Group>(null);
  const run = useRef({ x: -40, dir: 1, wait: 3 });
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const s = run.current;
    if (s.wait > 0) {
      s.wait -= dt;
      g.visible = false;
      return;
    }
    g.visible = true;
    // Ease in and out of the tile, at full speed in the middle
    s.x += s.dir * 7 * dt;
    if (Math.abs(s.x) > 40) {
      s.dir = -s.dir;
      s.x = 40 * -s.dir;
      s.wait = 10;
    }
    g.position.x = s.x;
    g.rotation.y = s.dir > 0 ? 0 : Math.PI;
  });
  const section = (offset: number, pantograph: boolean) => {
    const L = 11.5;
    const pillars = Array.from({ length: 7 }, (_, i) => -L / 2 + 0.8 + i * ((L - 1.6) / 6));
    return (
      <group position-x={offset}>
        <Box size={[L, 1.15, 2.3]} color={C.tram} position-y={0.95} />
        <Box size={[L, 0.08, 2.34]} color="#f4f2ee" position-y={1.56} />
        <Box size={[L, 1.05, 2.26]} color={C.glass} position-y={2.12} />
        {pillars.map((x) => (
          <Box key={x} size={[0.14, 1.05, 2.32]} color={C.tram} position={[x, 2.12, 0]} />
        ))}
        <Box size={[L, 0.35, 2.3]} color={C.tram} position-y={2.82} />
        <Box size={[L - 0.6, 0.18, 1.9]} color="#a7b0a8" position-y={3.06} />
        {[-L / 3, L / 3].map((x) => (
          <Box key={x} size={[2, 0.4, 2]} color="#2b2b2b" position={[x, 0.3, 0]} />
        ))}
        {pantograph && (
          <group position={[0, 3.15, 0]}>
            <Box
              size={[0.06, 1.7, 0.06]}
              color="#333333"
              position={[-0.35, 0.8, 0]}
              rotation-z={-0.45}
            />
            <Box
              size={[0.06, 1.7, 0.06]}
              color="#333333"
              position={[0.35, 0.8, 0]}
              rotation-z={0.45}
            />
            <Box size={[0.08, 0.06, 1.4]} color="#333333" position-y={2.9} />
            <Box size={[0.06, 1.5, 0.06]} color="#333333" position={[0, 2.2, 0]} />
          </group>
        )}
      </group>
    );
  };
  return (
    <group ref={ref} position={[-40, 0, RAIL]} visible={false}>
      {section(-6, false)}
      <Box size={[0.4, 2.6, 2]} color="#2b2b2b" position={[0, 1.7, 0]} />
      {section(6, true)}
      {/* Nose: headlights at the front, red lights at the back */}
      {[-0.7, 0.7].map((z) => (
        <group key={z}>
          <Box size={[0.05, 0.16, 0.3]} color="#fff6d8" glow position={[11.78, 0.9, z]} />
          <Box size={[0.05, 0.14, 0.26]} color="#c0392b" glow position={[-11.78, 0.9, z]} />
        </group>
      ))}
      <Box size={[0.05, 0.3, 1.2]} color="#111111" position={[11.78, 2.7, 0]} />
    </group>
  );
}

/** A car driving past in the far lane every now and then. */
function PassingCar() {
  const ref = useRef<Group>(null);
  const wheels = useRef<Group>(null);
  const run = useRef({ x: 30, wait: 6 });
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const s = run.current;
    if (s.wait > 0) {
      s.wait -= dt;
      g.visible = false;
      return;
    }
    g.visible = true;
    s.x -= 9 * dt;
    if (s.x < -30) {
      s.x = 30;
      s.wait = 7;
    }
    g.position.x = s.x;
    wheels.current?.children.forEach((w) => {
      w.rotation.y += (9 / 0.33) * dt;
    });
  });
  return (
    <group ref={ref} position={[30, 0, CAR_LANE]} visible={false}>
      <Car color="#e0b13c" wheels={wheels} rotation-y={Math.PI} />
    </group>
  );
}

/** Someone cycling along the bike lane, pedalling. */
function Cyclist() {
  const ref = useRef<Group>(null);
  const wheels = useRef<Group>(null);
  const rig = useRef<Rig>({ legs: [], arms: [] });
  const run = useRef({ x: -26, wait: 2, phase: 0 });
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const s = run.current;
    if (s.wait > 0) {
      s.wait -= dt;
      g.visible = false;
      return;
    }
    g.visible = true;
    s.x += 4.2 * dt;
    if (s.x > 26) {
      s.x = -26;
      s.wait = 9;
    }
    s.phase += dt * 6;
    g.position.x = s.x;
    wheels.current?.children.forEach((w) => {
      w.rotation.z -= (4.2 / 0.33) * dt;
    });
    // Pedalling: thighs forward, alternating; arms reaching for the handlebar
    rig.current.legs.forEach((leg, i) => {
      if (leg) leg.rotation.x = -1.05 + Math.sin(s.phase + i * Math.PI) * 0.45;
    });
    rig.current.arms.forEach((arm) => {
      if (arm) arm.rotation.x = -1.05;
    });
  });
  return (
    <group ref={ref} position={[-26, 0, BIKE_LANE]} visible={false}>
      <Bike color="#2f6fa5" wheels={wheels} />
      <Figure index={4} rig={rig} position={[-0.12, 0.1, 0]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

// ─── People and animals ──────────────────────────────────────────────────────

/** A small dog trotting beside its owner, legs and tail going. */
function Dog({ trot, ...props }: { trot: RefObject<number> } & ThreeElements["group"]) {
  const legs = useRef<Group>(null);
  const tail = useRef<Group>(null);
  useFrame(({ clock }) => {
    const p = trot.current;
    legs.current?.children.forEach((l, i) => {
      l.rotation.x = Math.sin(p * 1.6 + (i % 2) * Math.PI + (i > 1 ? Math.PI / 2 : 0)) * 0.5;
    });
    if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 12) * 0.5;
  });
  const fur = "#b07a45";
  return (
    <group {...props}>
      <Box size={[0.22, 0.2, 0.55]} color={fur} position-y={0.38} />
      <Box size={[0.18, 0.18, 0.22]} color={fur} position={[0, 0.52, 0.32]} />
      <Box size={[0.1, 0.08, 0.1]} color="#3a2a1a" position={[0, 0.48, 0.46]} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.05, 0.1, 0.04]} color="#7a5230" position={[s * 0.07, 0.65, 0.28]} />
      ))}
      <group ref={legs}>
        {[
          [-0.07, 0.2],
          [0.07, 0.2],
          [-0.07, -0.2],
          [0.07, -0.2],
        ].map(([x = 0, z = 0]) => (
          <group key={`${x}${z}`} position={[x, 0.3, z]}>
            <Box size={[0.05, 0.28, 0.05]} color={fur} position-y={-0.14} />
          </group>
        ))}
      </group>
      <group ref={tail} position={[0, 0.45, -0.28]}>
        <Box size={[0.04, 0.04, 0.22]} color={fur} position-z={-0.1} rotation-x={-0.6} />
      </group>
    </group>
  );
}

/** Someone strolling along a pavement and back, optionally walking a dog. */
function Stroller({
  index,
  z,
  from,
  to,
  speed = 1.1,
  dog = false,
}: {
  index: number;
  z: number;
  from: number;
  to: number;
  speed?: number;
  dog?: boolean;
}) {
  const ref = useRef<Group>(null);
  const rig = useRef<Rig>({ legs: [], arms: [] });
  const run = useRef({ x: (from + to) / 2, dir: 1, wait: 0, heading: Math.PI / 2, stride: 0 });
  const phase = useRef(0);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const s = run.current;
    let walking = false;
    if (s.wait > 0) s.wait -= dt;
    else {
      walking = true;
      s.x += s.dir * speed * dt;
      if (s.x > to || s.x < from) {
        s.x = MathUtils.clamp(s.x, from, to);
        s.dir = -s.dir;
        s.wait = 2.5;
      }
    }
    const goal = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    s.heading = MathUtils.damp(s.heading, goal, 4, dt);
    s.stride = MathUtils.damp(s.stride, walking ? 1 : 0, 6, dt);
    phase.current += dt * 7 * s.stride;
    g.position.set(s.x, Math.abs(Math.sin(phase.current)) * 0.03 * s.stride, z);
    g.rotation.y = s.heading;
    stride(rig.current, phase.current, s.stride);
  });
  return (
    <group ref={ref} position={[(from + to) / 2, 0, z]}>
      <Figure index={index} rig={rig} />
      {dog && <Dog trot={phase} position={[0.55, 0, 0.9]} />}
    </group>
  );
}

/** Someone waiting at the tram stop, shifting their weight now and then. */
function Waiting(props: ThreeElements["group"]) {
  const ref = useRef<Group>(null);
  const rig = useRef<Rig>({ legs: [], arms: [] });
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.8) * 0.02;
  });
  return (
    <group ref={ref} {...props}>
      <Figure index={7} rig={rig} />
    </group>
  );
}

/** A small flock circling high above the street, wings flapping. */
function Birds() {
  const flock = useRef<Group>(null);
  const birds = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        radius: 11 + (i % 3) * 2.2,
        height: 13 + (i % 2) * 1.4,
        offset: i * 0.45,
      })),
    [],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flock.current?.children.forEach((bird, i) => {
      const b = birds[i];
      if (!b) return;
      const a = t * 0.22 + b.offset;
      bird.position.set(
        Math.cos(a) * b.radius,
        b.height + Math.sin(t * 0.9 + i) * 0.4,
        Math.sin(a) * b.radius + 3,
      );
      bird.rotation.y = -a - Math.PI / 2;
      const [left, right] = bird.children;
      const flap = Math.sin(t * 9 + i * 1.3) * 0.7;
      if (left) left.rotation.x = flap;
      if (right) right.rotation.x = -flap;
    });
  });
  return (
    <group ref={flock}>
      {birds.map((_, i) => (
        <group key={i}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[0, 0, s * 0.22]} rotation-x={Math.PI / 2}>
                <planeGeometry args={[0.16, 0.42]} />
                <meshStandardMaterial color="#2b2b30" side={DoubleSide} />
              </mesh>
            </group>
          ))}
          <mesh>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial color="#2b2b30" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── The whole neighbourhood ─────────────────────────────────────────────────

const NEIGHBOURS: { x: number; z: number; look: TownhouseLook }[] = [
  {
    x: -12,
    z: 0,
    look: {
      width: 8.4,
      floors: 2,
      render: "#dfe6ea",
      trim: "#c9d3d8",
      shutter: "#5f7f6a",
      roof: "#7a3b2a",
      door: "#3e4f5c",
    },
  },
  {
    x: -19.1,
    z: 0,
    look: {
      width: 5.8,
      floors: 3,
      render: "#e9d9c4",
      trim: "#d2bc9c",
      shutter: "#f4f2ee",
      roof: "#5a4a42",
      door: "#6b2e2a",
    },
  },
  {
    x: 17,
    z: -9,
    look: {
      width: 10,
      floors: 2,
      render: "#e6cfc0",
      trim: "#cdb09c",
      shutter: "#a0522d",
      roof: "#4a3c36",
      door: "#2f4a3a",
    },
  },
];

export function Surroundings() {
  return (
    <>
      <Ground />
      <TramLine />
      {NEIGHBOURS.map(({ x, z, look }) => (
        <Townhouse key={x} look={look} position={[x, 0, z]} />
      ))}

      {/* Back garden */}
      <Hedge x0={-TILE_X} x1={TILE_X} z={BACK + 0.4} />
      <Fence along="z" at={-7.9} a={BACK + 0.8} b={-4} />
      <Fence along="z" at={12} a={-4} b={3.6} />
      <Tree x={-6} z={-12} size={1.1} seed={1} fruit />
      <Tree x={6} z={-13.8} size={0.85} seed={2} />
      <Tree x={10} z={-3} size={1} seed={3} />
      <Tree x={-14} z={-11.5} size={1.4} seed={4} />
      <Patio position={[3, 0, -7.5]} />
      <Laundry position={[7.6, 0, -10.6]} />
      <Swing position={[-5.6, 0, -6.6]} />
      <VegBed position={[-1.8, 0, -12.6]} />
      <VegBed position={[0.9, 0, -12.6]} />
      <Shed position={[10.5, 0, -12.6]} />
      <Bins position={[-7.2, 0, 2.6]} rotation-y={Math.PI / 2} />
      <Bike color="#b4440f" position={[-6.9, 0, -0.8]} rotation-y={Math.PI / 2} />

      {/* Near pavement: bikes at the railing, lamps, trees at the corners */}
      <Bike color="#3b6ea5" position={[-3.4, 0, 7.05]} rotation-y={0.08} />
      <Bike color="#5f8f5a" position={[-2.3, 0, 7.05]} rotation-y={-0.06} />
      <Lamp x={-11} z={7.25} toward={1} />
      <Lamp x={11} z={7.25} toward={1} />
      <Tree x={-17} z={6.2} size={0.9} seed={5} />
      <Tree x={16} z={6.2} size={0.95} seed={6} />

      {/* Parked cars */}
      <Car color="#c43b2f" position={[-15, 0, PARKING]} />
      <Car color="#e9e6df" position={[3.5, 0, PARKING]} />
      <Car color="#2f5d8a" position={[14, 0, PARKING]} />

      {/* Far side: tram stop, lamps, park strip with fountain, trees and benches */}
      <TramStop position={[5, 0, 16.9]} rotation-y={Math.PI} />
      <Waiting position={[4.2, 0, 16.6]} rotation-y={Math.PI} />
      <Lamp x={-6} z={15.95} toward={-1} />
      <Lamp x={16} z={15.95} toward={-1} />
      <Fountain position={[-13, 0, 19.6]} />
      {[-18.5, -7.5, 1.5, 11, 19].map((x, i) => (
        <Tree key={x} x={x} z={19.9} size={1.05} seed={7 + i} />
      ))}
      <Bench position={[-3, 0, 19.3]} rotation-y={Math.PI} />
      <Bench position={[7.5, 0, 19.3]} rotation-y={Math.PI} />
      <Hedge x0={-TILE_X} x1={TILE_X} z={FRONT - 0.4} height={0.8} />

      {/* Life on the street */}
      <Stroller index={9} z={6.1} from={-15} to={15} dog />
      <Stroller index={10} z={18.05} from={-20} to={18} speed={0.9} />
      <Birds />
      <Clipped>
        <Tram />
        <PassingCar />
        <Cyclist />
      </Clipped>
    </>
  );
}
