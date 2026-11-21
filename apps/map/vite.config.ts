import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vitest/config";

/** CesiumJS loads its workers, shaders and images at run time from CESIUM_BASE_URL. */
const CESIUM_BASE = "cesium";
const cesiumBuild = join(
  dirname(createRequire(import.meta.url).resolve("cesium/package.json")),
  "Build",
  "Cesium",
);
const CESIUM_DIRS = ["Workers", "Assets", "ThirdParty", "Widgets"];
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".ktx2": "image/ktx2",
};

/** three.js's Draco decoder, for the plant room model in the Inside view (inside/PlantRoom.tsx). */
const DRACO_BASE = "draco";
const dracoDir = join(
  dirname(createRequire(import.meta.url).resolve("three")),
  "..",
  "examples",
  "jsm",
  "libs",
  "draco",
  "gltf",
);

/** Serves files under `root` at /`base`/ in dev. */
function serveDir(server: ViteDevServer, base: string, root: string) {
  server.middlewares.use(`/${base}/`, (req, res, next) => {
    const path = normalize(join(root, decodeURIComponent((req.url ?? "").split("?")[0] ?? "")));
    if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) return next();
    res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
    createReadStream(path).pipe(res);
  });
}

/** Serves Cesium's and the Draco decoder's static files in dev; copies them next to the bundle. */
function cesiumAssets(): Plugin {
  return {
    name: "kachel-cesium-assets",
    configureServer(server) {
      serveDir(server, CESIUM_BASE, cesiumBuild);
      serveDir(server, DRACO_BASE, dracoDir);
    },
    writeBundle(options) {
      const out = join(options.dir ?? "dist", CESIUM_BASE);
      for (const dir of CESIUM_DIRS)
        cpSync(join(cesiumBuild, dir), join(out, dir), { recursive: true });
      cpSync(dracoDir, join(options.dir ?? "dist", DRACO_BASE), { recursive: true });
    },
  };
}

/**
 * ElCom's tariff API blocks calls from other sites (its firewall rejects the CORS preflight), so
 * the dev and preview servers pass the card's /elcom requests on (BuildingCard: ELCOM_PROXY).
 */
const elcom = {
  "/elcom": {
    target: "https://www.strompreis.elcom.admin.ch",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/elcom/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), cesiumAssets()],
  server: { proxy: elcom },
  preview: { proxy: elcom },
  // CesiumJS is one large module; it loads once and is cached.
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: "jsdom" },
});
