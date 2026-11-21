import heatLoopStill from "./heat-loop-still.png";
import heatLoopWideStill from "./heat-loop-wide-still.png";
import heatLoopWide from "./heat-loop-wide.webp";
import heatLoop from "./heat-loop.webp";

const pictures = {
  house: { motion: heatLoop, still: heatLoopStill },
  wide: { motion: heatLoopWide, still: heatLoopWideStill },
};

/**
 * A small looping picture of the idea: the servers' heat fills the tank and warms the house.
 * "house" shows the whole house; "wide" is a 3:1 crop on the basement, for a header.
 */
export function HeatLoop({
  className = "",
  variant = "house",
}: {
  className?: string;
  variant?: keyof typeof pictures;
}) {
  const { motion, still } = pictures[variant];
  return (
    <picture>
      <source srcSet={still} media="(prefers-reduced-motion: reduce)" />
      <img
        src={motion}
        className={className}
        alt="A basement server runs a job, its heat fills the hot-water tank and warms the house"
      />
    </picture>
  );
}
