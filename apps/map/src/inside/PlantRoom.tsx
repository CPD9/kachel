import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import {
  Box3,
  type Camera,
  Color,
  type Object3D,
  PMREMGenerator,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import plantRoomUrl from "../../../../docs/models/plantroom.glb?url";

/** The Draco decoder from three's package, served next to the app (vite.config.ts). */
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;
const BACKGROUND = "#0b0e14";

/** The room's walls, ceiling and door: hidden while the camera looks at them from outside. */
const ENCLOSURE = /^(Wall_|Ceiling|Door_)/;

interface Panel {
  readonly object: Object3D;
  /** A point on the panel and the direction out of the room through it. */
  readonly at: Vector3;
  readonly out: Vector3;
}

/** Each wall, the ceiling and the door, with the side of the room it closes. */
function panelsOf(root: Object3D, centre: Vector3): Panel[] {
  const panels: Panel[] = [];
  root.traverse((o) => {
    if (!ENCLOSURE.test(o.name)) return;
    const box = new Box3().setFromObject(o);
    const at = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    // A panel is thin across the side it closes; its outward axis is that thin one.
    const d = at.clone().sub(centre);
    const thin = size.x <= size.y && size.x <= size.z ? "x" : size.y <= size.z ? "y" : "z";
    const out = new Vector3();
    out[thin] = Math.sign(d[thin]) || 1;
    panels.push({ object: o, at, out });
  });
  return panels;
}

/** What the Inside view needs each frame: the orbit, and the walls stepping aside. */
interface Stage {
  update(): void;
  dispose(): void;
}

/**
 * Lights and frames the room, three quarters from the front and a little above so the rack and
 * the tank both show, and lets the camera orbit it. Each frame, the walls, ceiling and door
 * between the camera and the room are hidden, so the room reads as a cutaway from any side.
 */
function stageRoom(room: Object3D, camera: Camera, gl: WebGLRenderer, scene: Scene): Stage {
  const box = new Box3().setFromObject(room);
  const centre = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const panels = panelsOf(room, centre);
  // Soft studio light for the metals, as in the renders.
  const pmrem = new PMREMGenerator(gl);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.background = new Color(BACKGROUND);
  // Far enough back that the floor's near corner stays above the stills strip at 1080p.
  const aim = centre.clone();
  camera.position.copy(aim).add(new Vector3(0.9, 0.55, 1.1).multiplyScalar(radius * 1.9));
  camera.lookAt(aim);
  const controls = new OrbitControls(camera, gl.domElement);
  controls.target.copy(aim);
  controls.enableDamping = true;
  controls.minDistance = radius * 0.4;
  controls.maxDistance = radius * 3;
  controls.maxPolarAngle = Math.PI * 0.55;
  const toCamera = new Vector3();
  return {
    update() {
      controls.update();
      for (const p of panels) {
        // Hidden when the camera is outside the room on this panel's side.
        p.object.visible = toCamera.copy(camera.position).sub(p.at).dot(p.out) < 0;
      }
    },
    dispose() {
      controls.dispose();
      env.dispose();
      pmrem.dispose();
    },
  };
}

/** The plant room, framed, with the walls nearest the camera out of the way. */
function Room() {
  const gltf = useLoader(GLTFLoader, plantRoomUrl, (loader) => {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    loader.setDRACOLoader(draco);
  });
  const { camera, gl, scene } = useThree();
  const stage = useRef<Stage | null>(null);
  useEffect(() => {
    const s = stageRoom(gltf.scene, camera, gl, scene);
    stage.current = s;
    return () => {
      s.dispose();
      stage.current = null;
    };
  }, [gltf, camera, gl, scene]);
  useFrame(() => stage.current?.update());
  return <primitive object={gltf.scene} />;
}

/** The plant room in 3D: drag to turn, scroll to zoom. */
export default function PlantRoom() {
  return (
    <Canvas
      camera={{ fov: 40, near: 0.05, far: 200 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
      style={{ background: BACKGROUND }}
    >
      <hemisphereLight args={["#dfe6f2", "#2a2520", 0.6]} />
      <directionalLight position={[3, 6, 4]} intensity={1.4} />
      <Suspense fallback={null}>
        <Room />
      </Suspense>
    </Canvas>
  );
}
