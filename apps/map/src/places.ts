/** Where the map looks. Heights in metres above the ellipsoid; angles in degrees. */
export interface View {
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
  readonly height: number;
  readonly heading: number;
  readonly pitch: number;
}

/** Basel from above the old town, looking east along the Rhine to the Roche towers. */
export const BASEL: View = {
  name: "Basel",
  lon: 7.5815,
  lat: 47.5545,
  height: 380,
  heading: 68,
  pitch: -6,
};

/** The point the lighting and the window pattern are anchored on: Basel Marktplatz. */
export const ORIGIN = { lon: 7.5882, lat: 47.5579 } as const;

/** Bern's old town from the south-west, over the Aare loop. */
export const BERN: View = {
  name: "Bern",
  lon: 7.4335,
  lat: 46.9405,
  height: 1100,
  heading: 50,
  pitch: -18,
};

/** All of Switzerland from above, the cantons drawn on it. */
export const SWITZERLAND_VIEW: View = {
  name: "Switzerland",
  lon: 8.23,
  lat: 46.8,
  height: 480_000,
  heading: 0,
  pitch: -90,
};

/** Switzerland among its neighbours: France, Germany, Austria, Liechtenstein and Italy. */
export const NEIGHBOURS: View = {
  name: "Neighbours",
  lon: 9.0,
  lat: 47.0,
  height: 1_800_000,
  heading: 0,
  pitch: -90,
};

/** The whole globe, Europe in the middle. */
export const GLOBE: View = {
  name: "Globe",
  lon: 8.2,
  lat: 40,
  height: 16_000_000,
  heading: 0,
  pitch: -90,
};

/** The zoom-out steps, nearest first. */
export const STEPS: readonly View[] = [BASEL, BERN, SWITZERLAND_VIEW, NEIGHBOURS, GLOBE];

/** Above this camera height the canton borders show; lower down they would tint the city. */
export const CANTONS_FROM_M = 40_000;
