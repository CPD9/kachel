import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** three.js's Draco decoder, for the plant room model in the campus's basement (Campus.tsx). */
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
const TYPES: Record<string, string> = { ".js": "text/javascript", ".wasm": "application/wasm" };

/** Serves the Draco decoder at /draco/ in dev and copies it next to the bundle (as apps/map). */
function dracoDecoder(): Plugin {
  return {
    name: "kachel-draco",
    configureServer(server) {
      server.middlewares.use(`/${DRACO_BASE}/`, (req, res, next) => {
        const path = normalize(join(dracoDir, (req.url ?? "").split("?")[0] ?? ""));
        if (!path.startsWith(dracoDir) || !existsSync(path) || !statSync(path).isFile())
          return next();
        res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
        createReadStream(path).pipe(res);
      });
    },
    writeBundle(options) {
      cpSync(dracoDir, join(options.dir ?? "dist", DRACO_BASE), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dracoDecoder()],
  test: { environment: "jsdom" },
});
