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
      {fact.unit && <span className="ml-1 text-muted">{fact.unit}</span>}
    </>
  );
}

/** One tool's values and where each came from. */
function Card({ card }: { card: ToolResult }) {
  return (
    <figure data-tool={card.tool} className="rounded-md border border-grid bg-paper p-3 text-xs">
      <figcaption className="font-semibold tracking-wide text-muted uppercase">
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
              <p className="text-muted">{f.source}</p>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2">Nothing found.</p>
      )}
      {card.note && <p className="mt-2 text-muted">{card.note}</p>}
    </figure>
  );
}

function Answer({ turn }: { turn: Turn }) {
  return (
    <li className="space-y-2">
      <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-ink px-3 py-2 text-sm text-paper">
        {turn.question}
      </p>
      <div className="max-w-[95%] space-y-2">
        <p data-answer className="text-sm">
          {turn.answer}
        </p>
        {turn.unchecked.length > 0 && (
          <p role="note" className="rounded bg-amber/30 px-2 py-1 text-xs">
            No tool gave {turn.unchecked.join(", ")}: check{" "}
            {turn.unchecked.length > 1 ? "these" : "it"} before relying on it.
          </p>
        )}
        {turn.cards.length === 0 && (
          <p className="text-xs text-muted">The model answered without reading any data.</p>
        )}
        {turn.cards.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {turn.cards.map((c, i) => (
              <Card key={`${c.tool}-${i}`} card={c} />
            ))}
          </div>
        )}
        {turn.thinking && (
          <details className="text-xs text-muted">
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
    <section aria-labelledby="ask" className="rounded-lg border border-grid bg-paper p-5">
      <h2 id="ask" className="text-lg font-semibold">
        Ask your house
      </h2>
      <p className="mt-1 text-xs text-muted">
        {model.name} on this computer answers from your house&apos;s own data; nothing goes to the
        cloud. Every number comes from a tool, shown with its source.
      </p>
      {status === "checking" && (
        <p className="mt-3 text-sm text-muted">Looking for the local model…</p>
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
      {busy && <p className="mt-3 text-sm text-muted">{model.name} is reading the house…</p>}
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
                className="rounded-full border border-grid px-3 py-1 text-xs hover:border-ink disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-3 flex gap-2">
            <label htmlFor="ask-input" className="sr-only">
              Your question
            </label>
            <input
              id="ask-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about your heat, money, servers or solar"
              className="min-w-0 flex-1 rounded-md border border-grid px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="rounded-md bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </>
      )}
    </section>
  );
}
