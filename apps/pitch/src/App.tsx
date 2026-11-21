import {
  ArrowRight,
  Building2,
  Check,
  Heater,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { BuildingDetails } from "./BuildingDetails";
import { Globe, INSIDE_DIVE_MS, type Stage } from "./Globe";
import { DEFAULT_MAP_URL, FADE_MS, mapUrl, NO_GLOBE_HOLD_MS } from "./handoff";
import { HouseView } from "./HouseView";
import { MarketHouses, MarketSetup, useMarket } from "./MarketView";
import { NeighbourDetails, NeighbourSwitch } from "./NeighbourDetails";
import { NEIGHBOURS } from "./neighbours";
import { SimulationView, useSimulation } from "./SimulationView";
import { VoiceBar, VoicePrompt } from "./VoicePrompt";

/** Status pill over the globe: pops in, with a check once done or a spinner while loading. */
function Pill({
  icon,
  label,
  loading = false,
}: {
  icon?: ReactNode;
  label: string;
  loading?: boolean;
}) {
  return (
    <span className="flex animate-pill-in items-center gap-2 rounded-full border border-white/10 bg-[#1b1d21]/85 py-1.5 pr-3 pl-2 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
      {loading ? (
        <LoaderCircle size={16} className="animate-spin text-clay" />
      ) : (
        <span className="grid size-6 place-items-center rounded-full bg-clay text-white">
          {icon}
        </span>
      )}
      <span className={loading ? "text-white/70" : ""}>{label}</span>
      {!loading && <Check size={14} className="text-clay" strokeWidth={3} />}
    </span>
  );
}

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

/** A full page load: the browser leaves the intro for the map. */
const navigate = (url: string) => window.location.assign(url);

/** True when a key press is meant for a text field or a shortcut, not for the presenter's keys. */
const typing = (e: KeyboardEvent) =>
  (e.target as HTMLElement).closest("input, textarea, [contenteditable]") !== null ||
  e.metaKey ||
  e.ctrlKey ||
  e.altKey;

/**
 * Pitch app: a landing page whose voice prompt collapses into a bar and reveals a rotating globe,
 * then hands over to the real map (apps/map) at the building, with its card. With a Mapbox token
 * the globe flies to the building first: "a" dives into the house, "m" (or the pill) opens the
 * map. Without a token there is no globe: the intro goes straight to the map.
 */
export function App({ go = navigate }: { go?: (url: string) => void }) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const mapBase = import.meta.env.VITE_MAP_URL || DEFAULT_MAP_URL;
  // What the presenter said; null while the landing page is still showing
  const [said, setSaid] = useState<string | null>(null);
  const send = useCallback((text: string) => setSaid(text), []);
  // How far the globe has got: Basel in view, then the home building lit up
  const [stage, setStage] = useState<Stage | null>(null);
  // Inside the building: the house in 3D with its floors, opened with "a" once the building is lit up
  const [inside, setInside] = useState(false);
  // The house takes over once the map has finished diving at the building
  const [houseShown, setHouseShown] = useState(false);
  // Fading out to the map's background, just before the page changes
  const [leaving, setLeaving] = useState(false);
  // The house keeps its answers once opened: it stays mounted, hidden while on the map
  const [houseMounted, setHouseMounted] = useState(false);
  useEffect(() => {
    if (!inside) return;
    const t = setTimeout(() => {
      setHouseShown(true);
      setHouseMounted(true);
    }, INSIDE_DIVE_MS);
    return () => {
      clearTimeout(t);
      setHouseShown(false);
    };
  }, [inside]);

  // "a" on the result page: on to the neighbours who could use the rack (like adobe's mall)
  const [gamer, setGamer] = useState(false);
  const [sim, setSim] = useState(false);
  // Which neighbour is picked, switched with the bar at the top
  const [who, setWho] = useState(0);
  const [atGamer, setAtGamer] = useState(false);
  // The buyer's side, after the simulation (see below)
  const market = useMarket();
  const closeMarket = market.close;
  const toGamer = useCallback(() => {
    setGamer(true);
    setInside(false);
  }, []);
  const backFromGamer = useCallback(() => {
    setGamer(false);
    setAtGamer(false);
    setSim(false);
    closeMarket();
    setInside(true);
  }, [closeMarket]);

  // "a" over the neighbours: the weather and earnings simulation over the whole block
  const simulation = useSimulation();
  const endSim = useCallback(() => {
    setSim(false);
    closeMarket();
  }, [closeMarket]);
  useEffect(() => {
    if (!atGamer || sim) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (e.key.toLowerCase() === "a") setSim(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [atGamer, sim]);

  // "a" in the simulation: the other side, someone who wants to run their computing in a house
  const openMarket = market.open;
  const inMarket = market.page !== null;
  useEffect(() => {
    if (!sim || inMarket) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (e.key.toLowerCase() === "a") openMarket();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim, inMarket, openMarket]);

  useEffect(() => {
    if (stage !== "building" || inside || gamer) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key.toLowerCase() === "a") setInside(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, inside, gamer]);

  // The hand-over: fade to the map's background, then load the map at the building
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => go(mapUrl(mapBase)), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving, go, mapBase]);

  // Without a token: "Basel identified", a moment of "Finding your building…", then the map
  useEffect(() => {
    if (said === null || token) return;
    const timers = [
      setTimeout(() => setStage("city"), 300),
      setTimeout(() => setLeaving(true), NO_GLOBE_HOLD_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [said, token]);

  // With the globe: once the building is lit, "m" opens the real map (also from inside the house)
  useEffect(() => {
    if (said === null || !token || stage !== "building") return;
    const onKey = (e: KeyboardEvent) => {
      if (!typing(e) && e.key.toLowerCase() === "m") setLeaving(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [said, token, stage]);

  if (said !== null) {
    return (
      <main className="relative h-screen w-screen overflow-hidden bg-black font-sans">
        {token && (
          <div className="absolute inset-0 animate-globe-in">
            <Globe
              token={token}
              onStage={setStage}
              inside={inside}
              neighbour={gamer ? who : null}
              onArrive={() => setAtGamer(true)}
              onPick={sim ? simulation.toggle : setWho}
              sim={sim && !inMarket ? simulation.view : null}
              market={
                sim && inMarket
                  ? {
                      pins: market.pins,
                      picked: market.current?.offer.id ?? null,
                      houses: market.page === "houses",
                      onPick: market.pick,
                    }
                  : null
              }
            />
          </div>
        )}
        {/* Short glowing border around the screen, replayed for each step (keyed by stage) */}
        {stage && (
          <div
            key={sim ? `sim-${market.page ?? ""}` : atGamer ? `neighbour-${who}` : stage}
            aria-hidden
            className="edge-glow animate-edge-glow"
          />
        )}
        {stage === "building" && !inside && !gamer && <BuildingDetails />}
        {stage === "building" && (houseShown || houseMounted) && (
          <HouseView visible={houseShown} onExit={() => setInside(false)} onNext={toGamer} />
        )}
        {atGamer && sim && !inMarket && <SimulationView s={simulation} onBack={endSim} />}
        {atGamer && sim && market.page === "setup" && (
          <MarketSetup m={market} onBack={market.close} />
        )}
        {atGamer && sim && market.page === "houses" && <MarketHouses m={market} />}
        {atGamer && !sim && NEIGHBOURS[who] && (
          <NeighbourDetails key={who} n={NEIGHBOURS[who]} onBack={backFromGamer} />
        )}
        {gamer && !sim && (
          <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-wrap justify-center gap-2 px-4">
            {atGamer ? (
              <NeighbourSwitch i={who} onSwitch={setWho} />
            ) : (
              <Pill key="looking" label="Finding who could use your rack…" loading />
            )}
          </div>
        )}
        {stage && !inside && !gamer && (
          <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-wrap justify-center gap-2 px-4">
            <Pill icon={<MapPin size={13} />} label="Basel identified" />
            {stage === "building" ? (
              <>
                <Pill key="found" icon={<Building2 size={13} />} label="Building identified" />
                {/* The hand-over to the real map and card (apps/map); "m" does the same */}
                <button
                  type="button"
                  onClick={() => setLeaving(true)}
                  className="pointer-events-auto flex animate-pill-in items-center gap-2 rounded-full border border-clay/50 bg-[#1b1d21]/85 py-1.5 pr-3 pl-2 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md hover:border-clay"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-clay text-white">
                    <MapIcon size={13} />
                  </span>
                  Real data on the map
                  <kbd className="rounded border border-white/20 px-1.5 text-[11px] text-white/60">
                    M
                  </kbd>
                </button>
              </>
            ) : (
              <Pill key="finding" label="Finding your building…" loading />
            )}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
          <VoiceBar
            // The transcript shows only while the globe looks for the building, then it's a follow-up box
            said={stage === "building" ? undefined : said}
            light={houseShown}
            onEnd={() => {
              setSaid(null);
              setStage(null);
              setInside(false);
              setLeaving(false);
              setGamer(false);
              setAtGamer(false);
              setSim(false);
              market.close();
              setHouseMounted(false);
            }}
          />
        </div>
        {/* Hand-over: fade to the map's own background (apps/map, bg-ink), then load the map */}
        {leaving && <div aria-hidden className="absolute inset-0 animate-handoff bg-map-ink" />}
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
