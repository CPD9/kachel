import { useCallback, useState } from "react";
import type { Fetch } from "../building/geoadmin";
import { FLEET, FLEET_SERVERS } from "../fleet/fleet";
import type { Scene } from "../scene/viewer";
import { loadNetworks, NETWORK_LIMIT } from "./thermal";

export type NetworkState = "off" | "loading" | number;

/** The two layer switches' state, owned by the page so the tour can flip them too. */
export function useLayers(scene: Scene | null, fetcher: Fetch = fetch) {
  const [networks, setNetworks] = useState<NetworkState>("off");
  const [servers, setServers] = useState(false);

  const setNetworksOn = useCallback(
    (on: boolean) => {
      if (scene === null) return;
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
    },
    [scene, fetcher],
  );

  const setServersOn = useCallback(
    (on: boolean) => {
      if (scene === null) return;
      scene.showHomeServers(on);
      setServers(on);
    },
    [scene],
  );

  return { networks, servers, setNetworksOn, setServersOn };
}

/** Layer switches: SFOE's district heating networks, and our idea of home servers beside them. */
export function Layers({
  networks,
  servers,
  setNetworksOn,
  setServersOn,
}: ReturnType<typeof useLayers>) {
  return (
    <section
      aria-label="Layers"
      className="absolute right-4 bottom-10 w-80 space-y-2 rounded-lg bg-ink/80 p-3 text-sm backdrop-blur"
    >
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={networks !== "off"}
          onChange={(e) => setNetworksOn(e.target.checked)}
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
          onChange={(e) => setServersOn(e.target.checked)}
          className="mt-1 accent-heat"
        />
        <span>
          <span className="font-medium">Kachel: heat from home servers</span>
          <span className="block text-xs text-paper/60">
            {`Our idea, as an illustration, not data: the scheduler's synthetic fleet, ${FLEET.length} houses with ${FLEET_SERVERS} servers, placed on real homes in Basel and Bern in hectares with high heat demand. Click a dot.`}
          </span>
        </span>
      </label>
    </section>
  );
}
