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
