/** Where the map looks. Heights in metres above the ellipsoid; angles in degrees. */
export interface View {
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
  readonly height: number;
  readonly heading: number;
  readonly pitch: number;
}

/** Basel from above Kleinbasel, looking south-west over the Rhine to the old town. */
export const BASEL: View = {
  name: "Basel",
  lon: 7.6005,
  lat: 47.5655,
  height: 620,
  heading: 225,
  pitch: -22,
};

/** The point the lighting and the window pattern are anchored on: Basel Marktplatz. */
export const ORIGIN = { lon: 7.5882, lat: 47.5579 } as const;
