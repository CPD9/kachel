import { ArrowUp, Mic, Presentation, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Waveform } from "./Waveform";

/*
 * Scripted demo transcript. Nothing is recorded and no speech is recognised: the microphone is
 * never opened. Presentation mode plays these lines on a timer, as if spoken, for the stage.
 */
/** What the presenter "says" in the scripted demo. */
export const MOCK_TRANSCRIPT = "I'm living in Basel, at Byfangweg 18.";
/** Interim guesses in uneven chunks, including a misheard word: [ms after start, text]. */
const MOCK_INTERIM: [number, string][] = [
  [700, "I'm living"],
  [1050, "I'm living in"],
  [1400, "I'm living in bass"],
  [1750, "I'm living in Basel"],
  [2150, "I'm living in Basel, in street"],
  [2500, MOCK_TRANSCRIPT],
];
const MOCK_AUTO_SEND_MS = 3000;

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Big chat box with a presentation button. Clicking it plays a scripted voice transcript (no
 * microphone, no speech recognition), then hands the final text to onSend.
 */
export function VoicePrompt({ onSend }: { onSend: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!listening) return;
    const timers = MOCK_INTERIM.map(([ms, t]) => setTimeout(() => setHeard(t), ms));
    const autoSend = setTimeout(() => onSend(MOCK_TRANSCRIPT), MOCK_AUTO_SEND_MS);
    const clock = setInterval(() => setSeconds((s) => s + 1), 1000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setListening(false);
    window.addEventListener("keydown", onKey);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(autoSend);
      clearInterval(clock);
      window.removeEventListener("keydown", onKey);
    };
  }, [listening, onSend]);

  const start = () => {
    setHeard("");
    setSeconds(0);
    setListening(true);
  };

  return (
    <div className="w-full max-w-2xl text-left">
      <div
        className={`rounded-2xl border bg-surface p-3 shadow-[0_12px_40px_rgba(17,20,24,0.08)] ${
          listening ? "border-clay ring-4 ring-clay/15" : "border-border"
        }`}
      >
        <textarea
          rows={2}
          readOnly
          value={listening ? heard : ""}
          placeholder={listening ? "" : "Where do you live?"}
          aria-label="Transcript"
          className={`w-full resize-none bg-transparent px-1 outline-none transition-colors duration-300 placeholder:text-muted ${
            listening && heard !== MOCK_TRANSCRIPT ? "text-muted" : "text-ink"
          }`}
        />
        {listening ? (
          <div className="flex items-center gap-3">
            <span className="relative grid size-3.5 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-clay/40" />
              <span className="size-2.5 rounded-full bg-clay ring-2 ring-clay/30" />
            </span>
            <span className="text-sm font-medium text-ink">Listening</span>
            <span className="text-sm text-muted tabular-nums">{formatTime(seconds)}</span>
            <Waveform className="ml-2 h-6" />
            <button
              aria-label="Cancel voice input"
              onClick={() => setListening(false)}
              className="ml-auto grid size-9 place-items-center rounded-lg border border-border text-muted hover:bg-black/5"
            >
              <X size={16} />
            </button>
            <button
              onClick={() => onSend(heard || MOCK_TRANSCRIPT)}
              className="flex items-center gap-2 rounded-lg bg-clay px-4 py-2 text-sm font-medium text-white hover:bg-clay-dark"
            >
              <span className="size-2.5 rounded-[2px] bg-white" /> Send
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <span className="grid size-8 place-items-center rounded-lg text-muted opacity-40">
              <Mic size={17} />
            </span>
            <button
              aria-label="Presentation mode"
              title="Presentation mode"
              onClick={start}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink"
            >
              <Presentation size={17} />
            </button>
            <span className="grid size-8 place-items-center rounded-lg bg-clay text-white opacity-50">
              <ArrowUp size={16} strokeWidth={2.5} />
            </span>
          </div>
        )}
      </div>
      {listening && (
        <p className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
          Speak naturally — sends automatically when you pause
          <span aria-hidden>•</span>
          <span>
            <kbd className="rounded border border-border px-1.5 py-0.5 font-sans text-ink">Esc</kbd>{" "}
            to cancel
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * The collapsed bar at the bottom: keeps "listening" while the globe is shown.
 * Shows what was said until `said` is cleared, then invites a follow-up (like the adobe project).
 * `light` switches to the light theme for the house view.
 */
export function VoiceBar({
  said,
  light = false,
  onEnd,
}: {
  said?: string | undefined;
  light?: boolean;
  onEnd: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div
      className={`flex w-full max-w-md animate-bar-in items-center gap-3 rounded-2xl border py-2 pr-2 pl-4 backdrop-blur-md transition-colors duration-500 ${
        light
          ? "border-border bg-surface/95 shadow-[0_8px_30px_rgba(17,20,24,0.12)]"
          : "border-white/10 bg-[#1b1d21]/85 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      }`}
    >
      <Waveform bars={10} className="h-5 shrink-0" />
      {said ? (
        <span className={`min-w-0 flex-1 truncate text-sm ${light ? "text-ink" : "text-white/75"}`}>
          {said}
        </span>
      ) : (
        <input
          value={text}
          placeholder="Ask a follow-up..."
          aria-label="Ask a follow-up"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setText("")}
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
            light ? "text-ink placeholder:text-muted" : "text-white placeholder:text-white/50"
          }`}
        />
      )}
      <button
        onClick={onEnd}
        className="h-10 rounded-xl bg-clay px-4 text-sm font-medium text-white hover:bg-clay-dark"
      >
        End
      </button>
    </div>
  );
}
