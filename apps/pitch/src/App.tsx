import { ArrowRight, Heater } from "lucide-react";
import { useCallback, useState } from "react";
import { Globe } from "./Globe";
import { VoiceBar, VoicePrompt } from "./VoicePrompt";

const NAV = ["How it works", "For buildings", "For data centers", "Contact"];
const SUGGESTIONS = ["How does it work?", "Is my building suitable?", "What does it cost?"];
const STEPS = [
  {
    title: "Servers compute",
    text: "Real workloads run on hardware in your basement or plant room.",
  },
  {
    title: "Heat is captured",
    text: "The waste heat goes into your heating circuit instead of the air.",
  },
  {
    title: "Your building stays warm",
    text: "Space heating and hot water, from the computing work your servers already do.",
  },
];

/** Pitch app: a landing page whose voice prompt collapses into a bar and reveals a rotating globe. */
export function App() {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  // What the presenter said; null while the landing page is still showing
  const [said, setSaid] = useState<string | null>(null);
  const send = useCallback((text: string) => setSaid(text), []);

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-page p-4 text-center text-ink">
        <p>
          Set <code>VITE_MAPBOX_TOKEN</code> in <code>apps/pitch/.env</code> and restart the dev
          server.
        </p>
      </main>
    );
  }

  if (said !== null) {
    return (
      <main className="relative h-screen w-screen overflow-hidden bg-black font-sans">
        <div className="absolute inset-0 animate-globe-in">
          {/* Later: fly to the hard-coded home location */}
          <Globe token={token} />
        </div>
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
          <VoiceBar said={said} onEnd={() => setSaid(null)} />
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-page font-sans text-ink">
      <div className="mx-auto max-w-6xl px-6">
        <header className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="flex items-center gap-2.5">
            <Heater size={26} className="text-clay" strokeWidth={2.2} />
            <span className="font-display text-2xl font-semibold tracking-tight">Kachel</span>
          </span>
          <nav className="hidden gap-8 text-[15px] md:flex">
            {NAV.map((label) => (
              <a key={label} href="#" className="hover:text-clay">
                {label}
              </a>
            ))}
          </nav>
          <a
            href="#"
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/85"
          >
            Check my building <ArrowRight size={16} />
          </a>
        </header>

        {/* Three rows with equal outer rows, so the chat box sits in the middle of the screen */}
        <section className="grid h-screen min-h-[640px] grid-rows-[1fr_auto_1fr] justify-items-center text-center">
          <div className="flex flex-col items-center justify-end pt-24 pb-8">
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-rust uppercase">
              Server heating
            </p>
            <h1 className="mb-4 max-w-3xl font-display text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">
              Your heat, powered by computing.
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-muted">
              We install servers in your building. They do real computing work, and the heat they
              give off warms your rooms and water.
            </p>
          </div>
          <VoicePrompt onSend={send} />
          <div className="flex flex-wrap content-start justify-center gap-3 pt-6">
            {SUGGESTIONS.map((label) => (
              <button
                key={label}
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:border-clay/40 hover:text-clay"
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-8 pb-20 md:grid-cols-3">
          {STEPS.map(({ title, text }, i) => (
            <div key={title} className="border-t border-border pt-6">
              <p className="mb-2 font-display text-lg font-medium text-rust">0{i + 1}</p>
              <h2 className="mb-2 text-xl font-semibold">{title}</h2>
              <p className="leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
