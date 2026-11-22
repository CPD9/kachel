import { DEMO_OPERATOR } from "@kachel/db";
import { useState, type FormEvent } from "react";
import { Sources } from "../shell/Shell";
import { card, field, primary } from "../ui";
import type { BuyerRow, Live, OperatorSource } from "./live";

function SignIn({ source }: { source: OperatorSource }) {
  const [email, setEmail] = useState(source.local ? DEMO_OPERATOR.email : "");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "wrong" | "error">("idle");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("busy");
    try {
      setState((await source.auth.signIn(email, password)) ? "idle" : "wrong");
    } catch {
      setState("error");
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 flex max-w-[420px] flex-col gap-3">
      <p className="text-[15px] text-label-2">
        Sign in as the operator to see every buyer and their jobs, live.
      </p>
      <input
        aria-label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={field}
      />
      <input
        aria-label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field}
      />
      <button
        type="submit"
        disabled={state === "busy"}
        className={`${primary} disabled:opacity-60`}
      >
        {state === "busy" ? "Signing in…" : "Sign in"}
      </button>
      {state === "wrong" && (
        <p role="alert" className="text-[14px]">
          That email and password do not match.
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-[14px]">
          Sign-in cannot be reached. Is the local database running? Start it with make dev.
        </p>
      )}
      {source.local && (
        <p className="text-[13px] text-label-2">
          Local demo: {DEMO_OPERATOR.email}, password {DEMO_OPERATOR.password}.
        </p>
      )}
    </form>
  );
}

/** Every buyer, what they buy and their jobs now, from Supabase, updating live. */
export function Buyers({
  live,
  rows,
  source,
}: {
  live: Live;
  rows: BuyerRow[];
  source: OperatorSource | undefined;
}) {
  const running = rows.reduce((s, r) => s + r.running, 0);
  return (
    <section aria-labelledby="buyers" className={`${card} flex flex-col p-5`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="buyers" className="text-[17px] font-semibold">
          Compute buyers
        </h2>
        {live.status === "live" && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-label-2">
            <span className="inline-block size-2 rounded-full bg-green" /> live
          </span>
        )}
      </div>
      {!source && (
        <p className="mt-4 text-[15px] text-label-2">
          Live data needs the local stack: run make dev. The other pages show the model&apos;s
          figures.
        </p>
      )}
      {source && live.email === null && <SignIn source={source} />}
      {source && live.email && live.status === "error" && (
        <p role="alert" className="mt-4 text-[15px]">
          The buyers cannot be read. Is the local database running? Start it with make dev.
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p className="mt-1 text-[15px] text-label-2">
            {rows.length} buyers · {running} jobs running now · synthetic buyers
          </p>
          <ul className="mt-3 flex-1 divide-y divide-sep/60 border-t border-sep/60">
            {rows.map((r) => (
              <li key={r.buyer.id} data-buyer={r.buyer.id} className="py-3">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-[16px] font-semibold">{r.buyer.name}</span>
                  <span className="text-[14px] text-label-2 tabular-nums">
                    {r.jobs.length} jobs
                  </span>
                </p>
                <p className="text-[13px] text-label-2">{r.buyer.buys}</p>
                <p className="mt-0.5 text-[13px] text-label tabular-nums">
                  {r.running} running · {r.paused} paused · {r.queued} queued
                  {r.done > 0 && ` · ${r.done} done`}
                  {r.offsite > 0 && ` · ${r.offsite} to a data centre`}
                </p>
              </li>
            ))}
          </ul>
          <Sources>
            <p>
              public.buyers and public.jobs in Supabase, read as the operator. The buyers and jobs
              are synthetic (supabase/seed.sql).
            </p>
          </Sources>
        </>
      )}
    </section>
  );
}
