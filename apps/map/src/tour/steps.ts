import { beforeSunset } from "../clock";
import { BASEL, ORIGIN, SWITZERLAND_VIEW, type View } from "../places";
import type { Scene } from "../scene/viewer";
import type { TourStep } from "./tour";

/** A building the tour stops at: its register number and where the register puts it. */
export interface TourBuilding {
  readonly name: string;
  readonly egid: number;
  readonly lon: number;
  readonly lat: number;
  readonly storeys: number;
}

/** What the tour needs from the page around the map. */
export interface TourDeps {
  readonly scene: Scene;
  openBuilding(building: TourBuilding): void;
  /** Tells the card the building is newer than swisstopo's 3D data (true), or not (false). */
  setNotIn3D(on: boolean): void;
  closeCards(): void;
  setNetworksOn(on: boolean): void;
  setServersOn(on: boolean): void;
  readonly now?: Date;
  /** How long a stop waits for tiles before going on regardless (?tourcap= in ms). */
  readonly tilesCapMs?: number;
}

/** Caps, so slow tiles on the stage laptop never stall the tour. */
const FLIGHT_CAP_MS = 6000;
const TILES_CAP_MS = 8000;

/**
 * The tour's one building: FHNW Campus Dreispitz, Dornacherstrasse 394, Basel, where the
 * hackathon is and where we built this. GWR (export 19.11.2026): EGID 243058419, built 2026,
 * class 1263 (schools), 6 storeys, 14,436 m² heated floor, 3,735 m² footprint, low-temperature
 * district heating. It opened in August 2026, after swissBUILDINGS3D's survey (the blocks around
 * it date from 2021, when the plot was a building site), so the tiles have no building here and
 * Sonnendach has no roof for it: the card shows our period estimate, and the map a marker.
 */
export const TOUR_BUILDING: TourBuilding = {
  name: "FHNW Campus Dreispitz",
  egid: 243058419,
  lon: 7.606272,
  lat: 47.537456,
  storeys: 6,
};

/** Metres a storey for the marker's height: an illustration, the register gives storeys only. */
const STOREY_M = 4;

/**
 * Looking north at a building from about 330 m south and 270 m above it, a little west, so it
 * sits right of centre, beside the card rather than behind it, with the blocks around it in view.
 */
export function viewOf(at: { readonly lon: number; readonly lat: number }, name: string): View {
  return {
    name,
    lon: at.lon - 0.0012,
    lat: at.lat - 0.003,
    height: 560,
    heading: 0,
    pitch: -38,
  };
}

/**
 * About 40 seconds: Basel at dusk, the FHNW campus, the networks and the fleet, all of
 * Switzerland. The map's clock holds during the tour, set at each stop, so dusk stays dusk.
 */
export function tourSteps(d: TourDeps): TourStep[] {
  const building = TOUR_BUILDING;
  const tilesCap = d.tilesCapMs ?? TILES_CAP_MS;
  /** Minutes before (positive) or after (negative) today's sunset in Basel. */
  const at = (minutesBefore: number) =>
    beforeSunset(d.now ?? new Date(), ORIGIN.lat, ORIGIN.lon, minutesBefore);
  /** Takes the campus's colour or marker off the map again. */
  const clearBuilding = () => {
    d.scene.highlightBuilding(null);
    d.scene.showMarker(null);
    d.setNotIn3D(false);
  };
  return [
    {
      caption: "Basel at dusk: the day ends, the heating comes on.",
      run: async (ctx) => {
        d.closeCards();
        clearBuilding();
        d.setNetworksOn(false);
        d.setServersOn(false);
        // The clock holds during the tour, set by hand at each stop: Basel just before sunset.
        d.scene.setPlaying(false);
        d.scene.setTime(at(5));
        await ctx.atMost(d.scene.flyTo(BASEL, 3), FLIGHT_CAP_MS);
        await ctx.atMost(d.scene.tilesLoaded(), tilesCap);
        ctx.show();
        await ctx.dwell(4000);
      },
    },
    {
      caption: "FHNW Campus Dreispitz, where we built this: its heat a year, from public data.",
      run: async (ctx) => {
        d.scene.setTime(at(-15));
        await ctx.atMost(d.scene.flyTo(viewOf(building, building.name), 3), FLIGHT_CAP_MS);
        // The card's figures come from the federal APIs: ask while the tiles load.
        d.openBuilding(building);
        d.scene.highlightBuilding(building.egid);
        await ctx.atMost(d.scene.tilesLoaded(), tilesCap);
        // Coloured if the 3D data has it; otherwise an orange pin where the register puts it.
        const missing = d.scene.highlightedCount() === 0;
        d.scene.showMarker(
          missing
            ? {
                lon: building.lon,
                lat: building.lat,
                heightM: building.storeys * STOREY_M,
              }
            : null,
        );
        d.setNotIn3D(missing);
        ctx.show();
        await ctx.dwell(7000);
      },
    },
    {
      caption: "District heating today, and Kachel's home servers beside it.",
      run: async (ctx) => {
        d.scene.setTime(at(-35));
        d.closeCards();
        clearBuilding();
        d.setNetworksOn(true);
        d.setServersOn(true);
        ctx.show();
        await ctx.dwell(7000);
      },
    },
    {
      caption: "All of Switzerland: the same public data exists for every building.",
      run: async (ctx) => {
        await ctx.atMost(d.scene.flyTo(SWITZERLAND_VIEW, 4), FLIGHT_CAP_MS);
        await ctx.atMost(d.scene.tilesLoaded(), tilesCap);
        ctx.show();
        await ctx.dwell(5000);
      },
    },
  ];
}
