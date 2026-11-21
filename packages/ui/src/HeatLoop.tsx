import heatLoopStill from "./heat-loop-still.png";
import heatLoopUrl from "./heat-loop.webp";

/** A small looping picture of the idea: the servers' heat fills the tank and warms the house. */
export function HeatLoop({ className = "" }: { className?: string }) {
  return (
    <picture>
      <source srcSet={heatLoopStill} media="(prefers-reduced-motion: reduce)" />
      <img
        src={heatLoopUrl}
        className={className}
        alt="A basement server runs a job, its heat fills the hot-water tank and warms the house"
      />
    </picture>
  );
}
