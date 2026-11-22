/** Dark frosted-glass card over the map or the 3D house. */
export const card = "edge-card pointer-events-auto animate-card-in rounded-[26px] p-2 text-white";
/** Small uppercase heading inside a card. */
export const label =
  "flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-white/55 uppercase";

/** Light frosted-glass card, for the bright 3D house view. */
export const lightCard =
  "pointer-events-auto animate-card-in rounded-[26px] p-2 text-ink bg-white/75 backdrop-blur-xl ring-1 ring-black/[0.06] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.18)]";
/** Small uppercase heading inside a light card. */
export const lightLabel =
  "flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted uppercase";

/**
 * The market's green family (index.css --color-forest-*), for inline styles and map pins. 700
 * carries white text (6.5:1), 300 is text on the dark cards (9:1), 500 is for fills without text.
 */
export const FOREST = {
  900: "#0e3b2e",
  700: "#1e6b4a",
  500: "#2f9e6b",
  300: "#7fd3a6",
  100: "#d8f3e3",
} as const;
