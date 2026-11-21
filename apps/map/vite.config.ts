import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
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

/** Serves Cesium's static files in dev and copies them next to the bundle on build. */
function cesiumAssets(): Plugin {
  return {
    name: "kachel-cesium-assets",
    configureServer(server) {
      server.middlewares.use(`/${CESIUM_BASE}/`, (req, res, next) => {
        const path = normalize(
          join(cesiumBuild, decodeURIComponent((req.url ?? "").split("?")[0] ?? "")),
        );
        if (!path.startsWith(cesiumBuild) || !existsSync(path) || !statSync(path).isFile())
          return next();
        res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
        createReadStream(path).pipe(res);
      });
    },
    writeBundle(options) {
      const out = join(options.dir ?? "dist", CESIUM_BASE);
      for (const dir of CESIUM_DIRS)
        cpSync(join(cesiumBuild, dir), join(out, dir), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cesiumAssets()],
  // CesiumJS is one large module; it loads once and is cached.
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: "jsdom" },
});
