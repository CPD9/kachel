import { useEffect, useRef, useState, type FormEvent } from "react";
import { ask, type Turn } from "./agent";
import { ModelError, type ChatModel, type ModelStatus } from "./model";
import type { ChatData, Fact, ToolResult } from "./tools";

export const EXAMPLES = [
  "How warm is the tank?",
  "What did my servers earn today?",
  "Why is server 4 paused?",
  "What would solar save me?",
];

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4 });

function Value({ fact }: { fact: Fact }) {
  const shown = typeof fact.value === "number" ? number.format(fact.value) : fact.value;
  return (
    <>
      {shown}
      {fact.unit && <span className="ml-1 text-secondary">{fact.unit}</span>}
    </>
  );
}

/** One tool's values and where each came from. */
function Card({ card }: { card: ToolResult }) {
  return (
    <figure data-tool={card.tool} className="rounded-xl bg-white p-3 text-xs">
      <figcaption className="font-semibold text-secondary">
        {card.title} <span className="font-normal normal-case">· tool {card.tool}</span>
      </figcaption>
      {card.facts.length > 0 ? (
        <dl className="mt-2 space-y-1.5">
          {card.facts.map((f) => (
            <div key={f.label}>
              <div className="flex items-baseline justify-between gap-3">
                <dt>{f.label}</dt>
                <dd className="text-right font-semibold tabular-nums">
                  <Value fact={f} />
                </dd>
              </div>
              <p className="text-secondary">{f.source}</p>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2">Nothing found.</p>
      )}
      {card.note && <p className="mt-2 text-secondary">{card.note}</p>}
    </figure>
  );
}

function Answer({ turn }: { turn: Turn }) {
  return (
    <li className="space-y-2">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-action px-4 py-2 text-sm text-white">
        {turn.question}
      </p>
      <div className="max-w-[95%] space-y-2">
        <p data-answer className="text-[15px]">
          {turn.answer}
        </p>
        {turn.unchecked.length > 0 && (
          <p role="note" className="rounded-lg bg-white px-3 py-2 text-xs">
            No tool gave {turn.unchecked.join(", ")}: check{" "}
            {turn.unchecked.length > 1 ? "these" : "it"} before relying on it.
          </p>
        )}
        {turn.cards.length === 0 && (
          <p className="text-xs text-secondary">The model answered without reading any data.</p>
        )}
        {turn.cards.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {turn.cards.map((c, i) => (
              <Card key={`${c.tool}-${i}`} card={c} />
            ))}
          </div>
        )}
        {turn.thinking && (
          <details className="text-xs text-secondary">
            <summary className="cursor-pointer">The model&apos;s reasoning</summary>
            <p className="mt-1 whitespace-pre-wrap">{turn.thinking}</p>
          </details>
        )}
      </div>
    </li>
  );
}

const STATUS: Record<Exclude<ModelStatus, "ready">, (model: string) => string> = {
  offline: () =>
    "The local model is not running, so the chat is off. Start Ollama (ollama serve); the rest of the page works without it.",
  "no-model": (m) => `Ollama is running but ${m} is not on this computer.`,
  "not-local": () => "The chat only talks to a model on this computer, and none is set.",
};

/**
 * Ask the house (#26): a local model on this computer answers through a few closed tools that
 * read the house's own data, and each answer shows the values it used and their source.
 */
export function Chat({ model, data }: { model: ChatModel; data: ChatData }) {
  const [status, setStatus] = useState<ModelStatus | "checking">("checking");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const stop = useRef<AbortController>(undefined);

  useEffect(() => {
    let current = true;
    void model.status().then((s) => current && setStatus(s));
    return () => {
      current = false;
      stop.current?.abort();
    };
  }, [model]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(undefined);
    stop.current = new AbortController();
    try {
      const turn = await ask(model, data, turns, q, stop.current.signal);
      setTurns((t) => [...t, turn]);
      setText("");
    } catch (e) {
      setError(e instanceof ModelError ? e.message : "The local model could not answer.");
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  const ready = status === "ready";
  return (
    <section aria-labelledby="ask" className="rounded-2xl bg-fill p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="ask" className="text-2xl font-semibold tracking-tight">
          Ask your house
        </h2>
        <code className="rounded-md bg-white px-2 py-0.5 font-mono text-xs text-label">
          {model.name}
        </code>
        <span className="text-xs text-secondary">Local AI · no cloud</span>
      </div>
      <p className="mt-3 text-[17px] text-label">
        Runs on this computer, as it would on the server in your basement.
      </p>
      <p className="mt-1 text-sm text-secondary">
        It answers from your house&apos;s own data, and no question or answer leaves the house.
        Every number comes from a tool, shown with its source.
      </p>
      {status === "checking" && (
        <p className="mt-3 text-sm text-secondary">Looking for the local model…</p>
      )}
      {status !== "checking" && !ready && (
        <p role="status" className="mt-3 text-sm">
          {STATUS[status](model.name)}
        </p>
      )}
      {turns.length > 0 && (
        <ol aria-live="polite" className="mt-4 space-y-5">
          {turns.map((t, i) => (
            <Answer key={i} turn={t} />
          ))}
        </ol>
      )}
      {busy && <p className="mt-3 text-sm text-secondary">{model.name} is reading the house…</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
      {ready && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => void send(q)}
                className="rounded-full bg-white px-3 py-1.5 text-sm text-action hover:bg-white/70 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-4">
            <label htmlFor="ask-input" className="text-xs text-secondary">
              Your question
            </label>
            <div className="mt-1 flex gap-3">
              <input
                id="ask-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask about your heat, money, servers or solar"
                className="h-12 min-w-0 flex-1 rounded-xl border border-field bg-white px-4 text-base focus:border-action focus:outline-2 focus:outline-action/30"
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="h-12 rounded-xl bg-action px-6 font-semibold text-white hover:bg-action-hover disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
