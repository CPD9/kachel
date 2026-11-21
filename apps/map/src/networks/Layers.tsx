import { useState } from "react";
import type { Fetch } from "../building/geoadmin";
import type { Scene } from "../scene/viewer";
import { loadNetworks, NETWORK_LIMIT } from "./thermal";

/** Layer switches: SFOE's district heating networks, and our idea of home servers beside them. */
export function Layers({ scene, fetcher = fetch }: { scene: Scene; fetcher?: Fetch }) {
  const [networks, setNetworks] = useState<"off" | "loading" | number>("off");
  const [servers, setServers] = useState(false);

  const toggleNetworks = (on: boolean) => {
    if (!on) {
      scene.showNetworks(null);
      setNetworks("off");
      return;
    }
    setNetworks("loading");
    void loadNetworks(scene.viewArea(), fetcher).then((list) => {
      scene.showNetworks(list);
      setNetworks(list.length);
    });
  };

  const toggleServers = (on: boolean) => {
    scene.showHomeServers(on);
    setServers(on);
  };

  return (
    <section
      aria-label="Layers"
      className="absolute right-4 bottom-10 w-80 space-y-2 rounded-lg bg-ink/80 p-3 text-sm backdrop-blur"
    >
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={networks !== "off"}
          onChange={(e) => toggleNetworks(e.target.checked)}
          className="mt-1 accent-[#e5484d]"
        />
        <span>
          <span className="font-medium">District heating today</span>
          <span className="block text-xs text-paper/60">
            {networks === "loading"
              ? "Loading SFOE's networks in view…"
              : typeof networks === "number"
                ? networks >= NETWORK_LIMIT
                  ? `The first ${NETWORK_LIMIT} networks in view; zoom in for all. Source: SFOE.`
                  : `${networks} ${networks === 1 ? "network" : "networks"} in view. Source: SFOE.`
                : "Thermal networks from SFOE."}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={servers}
          onChange={(e) => toggleServers(e.target.checked)}
          className="mt-1 accent-heat"
        />
        <span>
          <span className="font-medium">Kachel: heat from home servers</span>
          <span className="block text-xs text-paper/60">
            Our idea, drawn as an illustration, not data: many small servers in many homes instead
            of one central plant.
          </span>
        </span>
      </label>
    </section>
  );
}
