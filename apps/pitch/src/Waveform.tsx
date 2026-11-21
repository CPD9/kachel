import { useEffect, useState } from "react";

const randomLevels = (n: number) => Array.from({ length: n }, () => 0.15 + Math.random() * 0.85);

/** Fake microphone waveform: clay bars jumping to random heights (presentation only). */
export function Waveform({ bars = 32, className = "h-6" }: { bars?: number; className?: string }) {
  const [levels, setLevels] = useState(() => Array<number>(bars).fill(0.12));

  useEffect(() => {
    const id = setInterval(() => setLevels(randomLevels(bars)), 120);
    return () => clearInterval(id);
  }, [bars]);

  return (
    <div className={`flex items-center gap-[3px] ${className}`} aria-hidden>
      {levels.map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-clay" style={{ height: `${h * 100}%` }} />
      ))}
    </div>
  );
}
