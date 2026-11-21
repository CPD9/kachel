import sites from "./sites.json";

/**
 * The scheduler's synthetic fleet (services/scheduler/out/fleet_basel_bern_sites.csv), each house
 * placed on a real residential building by scripts/place-fleet.mjs. The buildings are real; the
 * houses, their servers and heat are synthetic. The map shows them as an illustration only.
 */
export interface FleetHouse {
  readonly id: string;
  readonly city: string;
  readonly servers: number;
  readonly heatDemandKwh: number;
  readonly egid: number;
  readonly lon: number;
  readonly lat: number;
  readonly hectareHeatMwh: number;
}

export const FLEET: readonly FleetHouse[] = sites;

const byEgid = new Map(FLEET.map((h) => [h.egid, h]));

/** The synthetic fleet house placed on this building, if any. */
export function fleetHouse(egid: number | null): FleetHouse | null {
  return egid === null ? null : (byEgid.get(egid) ?? null);
}

/** Servers in the fleet, for the layer's label. */
export const FLEET_SERVERS = FLEET.reduce((sum, h) => sum + h.servers, 0);
