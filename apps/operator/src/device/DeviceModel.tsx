import { useEffect, useRef, useState } from "react";
import {
  Box3,
  CanvasTexture,
  Color,
  HemisphereLight,
  DirectionalLight,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import modelUrl from "../../../../docs/models/orc-concept.glb?url";
import { type Part, PART_LABEL, PIPES, STEPS, STREAM_COLOUR } from "./cycle";

/** The Draco decoder from three's package, served next to the app (vite.config.ts). */
const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`;
const BACKGROUND = "#0b0e14";

/** Where each part goes when the model is pulled apart, in metres at full explode (+Y up). */
const EXPLODE: Record<Part | "Skid", [number, number, number]> = {
  Rack: [-1.3, 0, 0],
  HeatExchanger: [-0.75, 0, 0.35],
  HeatPump: [-0.25, 0.35, 0.7],
  Evaporator: [0, 0, 1.0],
  Turbine: [-0.35, 0.9, 1.0],
  Generator: [1.1, 0.45, 0.45],
  Condenser: [1.0, -0.05, -1.6],
  Skid: [0, -0.3, 0],
};
const PARTS = Object.keys(PART_LABEL) as Part[];
const UP = new Vector3(0, 1, 0);
/** Parts labelled under them, so the turbine's label clears the condenser's. */
const BELOW = new Set<string>(["Turbine"]);

/** How much further back the camera stands at an explode of k, so the spread parts stay in view. */
const spread = (k: number) => 1 + 0.3 * k;

export interface DeviceState {
  explode: number;
  step: number;
  summer: boolean;
}

/** A soft dash, repeated along each pipe's U (metres) and slid along it to show the flow. */
function dashTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 4;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.55, "rgba(255,255,255,1)");
    grad.addColorStop(0.7, "rgba(255,255,255,1)");
    grad.addColorStop(0.75, "rgba(255,255,255,0)");
    g.fillStyle = "#000";
    g.fillRect(0, 0, 64, 4);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 4);
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

interface Pipe {
  mesh: Mesh;
  mat: MeshStandardMaterial;
  stream: keyof typeof STREAM_COLOUR;
  step: number | null;
}

interface Built {
  groups: Map<Part | "Skid", { node: Object3D; anchor: Vector3; home: Vector3 }>;
  pipes: Pipe[];
  casing: MeshStandardMaterial[];
  shaft: Object3D | null;
  fans: Object3D[];
  /** The flanges at the skid's water connections: they belong to the pipes, so they fade too. */
  ends: Object3D[];
}

/** Names the parts, gives the pipes their flow material, and makes the heat pump see-through. */
function build(root: Object3D, dash: CanvasTexture): Built {
  const groups: Built["groups"] = new Map();
  for (const name of [...PARTS, "Skid"] as const) {
    const node = root.getObjectByName(name);
    if (!node) continue;
    // The label sits over the part's body: the turbine's inlet valve stands above it.
    const box = new Box3();
    for (const c of node.children) if (!c.name.startsWith("Valve_")) box.expandByObject(c);
    const y = BELOW.has(name) ? box.min.y - 0.08 : box.max.y + 0.12;
    const top = new Vector3((box.min.x + box.max.x) / 2, y, (box.min.z + box.max.z) / 2);
    groups.set(name, { node, anchor: top, home: node.position.clone() });
  }
  const pipes: Pipe[] = [];
  const casing: MeshStandardMaterial[] = [];
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const flow = PIPES[o.name];
    if (flow) {
      const base = o.material as MeshStandardMaterial;
      const mat = new MeshStandardMaterial({
        // Plain pipe colours underneath; the stream's colour is in the dashes.
        color: new Color(
          flow.stream === "power"
            ? "#1b2230"
            : flow.stream === "cool" || flow.stream === "vapour"
              ? "#4a525c"
              : `#${base.color.getHexString()}`,
        ),
        roughness: 0.55,
        metalness: 0.1,
        emissive: new Color(STREAM_COLOUR[flow.stream]),
        emissiveMap: dash,
        emissiveIntensity: 0,
        transparent: true,
      });
      o.material = mat;
      pipes.push({ mesh: o, mat, stream: flow.stream, step: flow.step });
      return;
    }
    const m = o.material as Material & { name: string; color?: Color };
    if (m.name === "HP_Casing") {
      const glass = (m as MeshStandardMaterial).clone();
      glass.transparent = true;
      glass.opacity = 0.22;
      glass.depthWrite = false;
      o.material = glass;
      o.renderOrder = 2;
      casing.push(glass);
    }
    // Status lights read as decoration here: keep them neutral, no green.
    if (/Green/i.test(m.name) && m.color) m.color.set("#c8ccd2");
    // The skid's grating as dull galvanised steel, not a bright white plate under studio light.
    if (m.name === "Deck_Grating" && m instanceof MeshStandardMaterial) {
      m.color.set("#4b4f55");
      m.metalness = 0.4;
      m.roughness = 0.7;
    }
  });
  const fans: Object3D[] = [];
  const ends: Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith("Spin_Cond_Fan")) fans.push(o);
    if (o.name.startsWith("Fl_")) ends.push(o);
  });
  return { groups, pipes, casing, shaft: root.getObjectByName("Spin_Shaft") ?? null, fans, ends };
}

/** Is WebGL there at all? Not in tests (jsdom) nor in some locked-down browsers. */
function hasWebGL() {
  return typeof window !== "undefined" && typeof window.WebGLRenderingContext !== "undefined";
}

/**
 * The device concept in 3D on a dark card: drag to turn, pinch or scroll to zoom. Parts pull
 * apart with `explode`, each is labelled, and dashes run along the pipes of the steps reached so
 * far (the current one brightest); with `summer`, the cooler water back to the servers runs too.
 */
export function DeviceModel({ state }: { state: DeviceState }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<Map<Part, HTMLDivElement>>(new Map());
  const live = useRef(state);
  useEffect(() => {
    live.current = state;
  }, [state]);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "no-webgl">(() =>
    hasWebGL() ? "loading" : "no-webgl",
  );

  useEffect(() => {
    const el = host.current;
    if (!el || !hasWebGL()) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // Not in this effect's body: React would render twice in a row.
      const t = requestAnimationFrame(() => setStatus("no-webgl"));
      return () => cancelAnimationFrame(t);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.domElement.style.display = "block";
    el.prepend(renderer.domElement);
    const scene = new Scene();
    scene.background = new Color(BACKGROUND);
    const pmrem = new PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    scene.add(new HemisphereLight("#dfe6f2", "#2a2520", 0.55));
    const sun = new DirectionalLight("#ffffff", 1.3);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const camera = new PerspectiveCamera(32, 1, 0.05, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.enablePan = false;
    const dash = dashTexture();

    let built: Built | null = null;
    let disposed = false;
    let frame = 0;
    let last = performance.now();
    let radius = 4;
    let shownExplode = live.current.explode;
    const centre = new Vector3();

    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const frameModel = () => {
      // Three quarters from the front; on a narrow card more from the side, so the line of
      // parts runs into the picture and stays large.
      const narrow = camera.aspect < 1;
      const dir = narrow ? new Vector3(0.95, 0.62, 0.85) : new Vector3(0.32, 0.42, 1);
      const half = (camera.fov * Math.PI) / 360;
      const fitH = radius / Math.tan(half);
      const fitW = radius / (Math.tan(half) * camera.aspect);
      const dist = Math.max(fitH, fitW) * (narrow ? 0.9 : 0.68) * spread(live.current.explode);
      controls.target.copy(centre);
      if (narrow) controls.target.x += radius * 0.1;
      camera.position.copy(controls.target).add(dir.normalize().multiplyScalar(dist));
      controls.minDistance = dist * 0.3;
      controls.maxDistance = dist * 2;
      controls.update();
    };
    fit();
    const resize = new ResizeObserver(() => {
      fit();
      if (built) frameModel();
    });
    resize.observe(el);

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    loader.setDRACOLoader(draco);
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        scene.add(gltf.scene);
        built = build(gltf.scene, dash);
        const box = new Box3().setFromObject(gltf.scene);
        box.getCenter(centre);
        centre.y *= 0.8;
        radius = box.getSize(new Vector3()).length() / 2;
        frameModel();
        setStatus("ready");
      },
      undefined,
      () => setStatus("failed"),
    );

    const p = new Vector3();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = live.current;
      if (built) {
        const k = s.explode;
        if (k !== shownExplode) {
          // Step back as the parts spread, keeping whatever zoom the viewer chose.
          const off = camera.position.clone().sub(controls.target);
          camera.position
            .copy(controls.target)
            .add(off.multiplyScalar(spread(k) / spread(shownExplode)));
          shownExplode = k;
        }
        for (const [name, g] of built.groups) {
          const [x, y, z] = EXPLODE[name];
          g.node.position.set(g.home.x + x * k, g.home.y + y * k, g.home.z + z * k);
        }
        dash.offset.x -= dt * 1.1;
        for (const pipe of built.pipes) {
          const on = pipe.step === null ? s.summer : pipe.step <= s.step;
          const now_ = pipe.step === s.step || (pipe.step === null && s.summer);
          const target = on ? (now_ ? 2.4 : 1.1) : 0;
          pipe.mat.emissiveIntensity += (target - pipe.mat.emissiveIntensity) * Math.min(1, dt * 6);
          pipe.mat.opacity = 1 - k * 0.8;
          pipe.mesh.visible = pipe.mat.opacity > 0.05;
        }
        for (const e of built.ends) e.visible = k < 0.25;
        // The shaft turns once vapour reaches the turbine; faster while the generator is the step.
        const rate = s.step >= 2 ? (s.step === 3 ? 16 : 9) : 0;
        built.shaft?.rotateX(rate * dt);
        for (const f of built.fans) f.rotateOnWorldAxis(UP, (s.step >= 2 ? 6 : 0) * dt);
        // Labels: the top of each part, on screen.
        const rect = el.getBoundingClientRect();
        const active = new Set(STEPS[s.step]?.parts ?? []);
        for (const part of PARTS) {
          const label = labels.current.get(part);
          const g = built.groups.get(part);
          if (!label || !g) continue;
          p.copy(g.anchor).add(g.node.position).sub(g.home).project(camera);
          const visible = p.z < 1;
          const x = ((p.x + 1) / 2) * rect.width;
          const y = ((1 - p.y) / 2) * rect.height;
          const lift = BELOW.has(part) ? "0%" : "-100%";
          label.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${lift})`;
          label.style.opacity = visible ? "1" : "0";
          label.dataset.active = active.has(part) ? "true" : "false";
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      draco.dispose();
      dash.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={host}
      data-device-model={status}
      className="relative h-[380px] touch-none overflow-hidden rounded-2xl select-none sm:h-[560px]"
      style={{ background: BACKGROUND }}
    >
      {status === "ready" &&
        PARTS.map((part) => (
          <div
            key={part}
            ref={(d) => {
              if (d) labels.current.set(part, d);
              else labels.current.delete(part);
            }}
            data-part-label={part}
            className="device-label pointer-events-none absolute top-0 left-0 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap"
          >
            {PART_LABEL[part]}
          </div>
        ))}
      {status !== "ready" && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-[14px] text-white/60">
          {status === "loading"
            ? "Loading the model…"
            : status === "failed"
              ? "The model did not load. Reload the page once."
              : "The 3D model needs WebGL, which this browser does not offer."}
        </p>
      )}
    </div>
  );
}
