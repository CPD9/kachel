import type { ThreeElements } from "@react-three/fiber";
import type { RefObject } from "react";
import type { Group } from "three";

/**
 * A simple low-poly person, shared by the residents inside the house and the passers-by outside:
 * legs with shoes, arms with hands, torso, neck, head with hair and eyes. Limbs hang from joints
 * registered in a `Rig`, so the caller can swing them (walking) or bend them (cycling).
 */

const SHIRTS = ["#ea580c", "#3b6ea5", "#5f8f5a", "#b4440f", "#7a5aa5", "#c79a2e"];
const PANTS = ["#2f3a4f", "#4a4038", "#3c4a3a", "#2b2b30", "#6b5a48"];
const SKIN = ["#f1d3b8", "#e0b48f", "#c68e64", "#8d5a3b", "#5e3a24"];
const HAIR = ["#2a1d15", "#5a3a22", "#a8743d", "#d9b36c", "#1a1a1a", "#8a8a8a"];

/** The joints a figure's limbs hang from: [left, right]. */
export type Rig = { legs: (Group | null)[]; arms: (Group | null)[] };

/** A small seeded random generator, so motion is the same on every run. */
export function seeded(seed: number) {
  let s = Math.imul(seed, 2654435761);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks a colour for a figure, varied per index so neighbours don't match. */
function pick(list: string[], index: number, salt: number): string {
  return list[(index * 7 + salt) % list.length] ?? "#888888";
}

/** A walking stride: legs and arms swing in opposite directions. */
export function stride(rig: Rig, phase: number, amount: number) {
  const swing = Math.sin(phase) * 0.55 * amount;
  rig.legs.forEach((leg, i) => {
    if (leg) leg.rotation.x = i ? -swing : swing;
  });
  rig.arms.forEach((arm, i) => {
    if (arm) arm.rotation.x = (i ? swing : -swing) * 0.8;
  });
}

/** One limb: a capsule hanging down from a joint, so rotating the group swings it. */
function Limb({
  radius,
  length,
  color,
  ...props
}: { radius: number; length: number; color: string } & ThreeElements["group"]) {
  return (
    <group {...props}>
      <mesh position-y={-length / 2 - radius}>
        <capsuleGeometry args={[radius, length, 4, 10]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** The figure, standing on y = 0 and facing +z; a kid is smaller (by default every third). */
export function Figure({
  index,
  kid = index % 3 === 2,
  rig,
  ...props
}: { index: number; kid?: boolean; rig: RefObject<Rig> } & ThreeElements["group"]) {
  const shirt = pick(SHIRTS, index, 0);
  const pants = pick(PANTS, index, 3);
  const skin = pick(SKIN, index, 1);
  const hair = pick(HAIR, index, 5);
  const longHair = index % 2 === 1;
  return (
    <group scale={kid ? 0.66 : 1} {...props}>
      {/* Legs with shoes, hinged at the hip */}
      {[-1, 1].map((side, i) => (
        <group
          key={side}
          ref={(el) => {
            rig.current.legs[i] = el;
          }}
          position={[side * 0.09, 0.88, 0]}
        >
          <Limb radius={0.075} length={0.62} color={pants} />
          <mesh position={[0, -0.82, 0.04]}>
            <boxGeometry args={[0.11, 0.07, 0.24]} />
            <meshStandardMaterial color="#2a2522" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Torso, a little flatter front to back */}
      <mesh position-y={1.18} scale={[1, 1, 0.7]}>
        <capsuleGeometry args={[0.17, 0.34, 4, 12]} />
        <meshStandardMaterial color={shirt} roughness={0.75} />
      </mesh>
      {/* Arms with hands, hinged at the shoulder */}
      {[-1, 1].map((side, i) => (
        <group
          key={side}
          ref={(el) => {
            rig.current.arms[i] = el;
          }}
          position={[side * 0.24, 1.43, 0]}
          rotation-z={side * 0.08}
        >
          <Limb radius={0.055} length={0.42} color={shirt} />
          <mesh position-y={-0.6}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color={skin} roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Neck, head, hair and eyes */}
      <mesh position-y={1.52}>
        <cylinderGeometry args={[0.055, 0.06, 0.1, 10]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      <mesh position-y={1.67} scale={[0.92, 1.05, 1]}>
        <sphereGeometry args={[0.12, 18, 14]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.69, -0.012]} scale={[0.96, 1.05, 1.04]}>
        <sphereGeometry args={[0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={hair} roughness={0.9} />
      </mesh>
      {longHair && (
        <mesh position={[0, 1.6, -0.07]} scale={[1, 1, 0.55]}>
          <capsuleGeometry args={[0.1, 0.14, 4, 10]} />
          <meshStandardMaterial color={hair} roughness={0.9} />
        </mesh>
      )}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.04, 1.69, 0.108]}>
          <sphereGeometry args={[0.013, 8, 6]} />
          <meshBasicMaterial color="#1f1a17" />
        </mesh>
      ))}
    </group>
  );
}
