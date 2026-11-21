import {
  Canvas,
  useFrame,
  useThree,
  type ThreeElements,
  type ThreeEvent,
} from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { ExtrudeGeometry, type Group, MathUtils, Shape, Spherical, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
  ground: "#1b1d21",
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
function Furniture({ room }: { room: Room }) {
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
  // Radiator under the back wall's window
  items.push(
    <Box
      key="radiator"
      size={[1, 0.55, 0.1]}
      color={COLORS.radiator}
      position={[cx, 0.45, -D / 2 + WALL + 0.08]}
    />,
  );
  return <>{items}</>;
}

/** Outer walls: solid at the back and left with windows, see-through at the front and right. */
function Walls() {
  const half = INNER / 2;
  return (
    <>
      <Box size={[W, INNER, WALL]} color={COLORS.wall} position={[0, half, -D / 2 + WALL / 2]} />
      <Box size={[WALL, INNER, D]} color={COLORS.wall} position={[-W / 2 + WALL / 2, half, 0]} />
      {[-2.4, 0, 2.4].map((x) => (
        <Box
          key={x}
          size={[1.1, 1.2, WALL + 0.02]}
          color={COLORS.window}
          position={[x, 1.5, -D / 2 + WALL / 2]}
        />
      ))}
      <Box
        size={[WALL + 0.02, 1.2, 1.4]}
        color={COLORS.window}
        position={[-W / 2 + WALL / 2, 1.5, 0]}
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

// ─── House ───────────────────────────────────────────────────────────────────

type HouseProps = {
  /** Open floor: the camera zooms to it and the storeys above move out of the way. */
  open: FloorId | null;
  /** Hovered floor (from the 3D view or a card): the storeys above lift for a peek. */
  hover: FloorId | null;
  onHover: (id: FloorId | null) => void;
  onOpen: (id: FloorId) => void;
};

function House({ open, hover, onHover, onOpen }: HouseProps) {
  const levelOf = (id: FloorId | null) => FLOORS.find((f) => f.id === id)?.level ?? null;
  const openLevel = levelOf(open);
  const hoverLevel = levelOf(hover);
  const liftFor = (level: number) =>
    openLevel !== null
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
                  <Furniture room={room} />
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
            <Walls />
          </Lift>
        );
      })}
      {/* The roof sits on the top floor, so it moves with it */}
      <Lift y={FLOORS.length * H} lift={liftFor(FLOORS.length)}>
        <Roof />
      </Lift>
    </>
  );
}

/** The demo house in 3D on a transparent canvas: orbit by drag, click a floor to zoom in. */
export function HouseScene(props: HouseProps) {
  const level = FLOORS.find((f) => f.id === props.open)?.level;
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [34, 30, 30], fov: 35 }}>
      <hemisphereLight args={["#fff4e8", "#1b1d21", 1.4]} />
      <directionalLight position={[8, 14, 10]} intensity={2.2} />
      <Camera {...(level === undefined ? HOUSE_FRAMING : floorFraming(level))} />
      <House {...props} />
    </Canvas>
  );
}
