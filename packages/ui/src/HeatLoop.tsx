import heatLoopUrl from "./heat-loop.svg";

/** A small looping picture of the idea: the server's heat fills the tank and warms the house. */
export function HeatLoop({ className = "" }: { className?: string }) {
  return (
    <img
      src={heatLoopUrl}
      className={className}
      alt="A basement server runs a job, its heat fills the hot-water tank and warms the house"
    />
  );
}
