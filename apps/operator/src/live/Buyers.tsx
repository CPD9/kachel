import { DEMO_OPERATOR } from "@kachel/db";
import { Sourced } from "@kachel/ui";
import { useState, type FormEvent } from "react";
import { panel } from "../ui";
import type { BuyerRow, Live, OperatorSource } from "./live";

const field =
  "rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[15px] text-white outline-none focus:border-[#06b6d4]";

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
    <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-col gap-3">
      <p className="text-[15px] text-white/60">
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
        className="rounded-xl bg-[#06b6d4] px-3 py-2 text-[15px] font-semibold text-white disabled:opacity-60"
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
        <p className="text-[13px] text-white/45">
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
    <section aria-labelledby="buyers" className={`${panel} flex flex-col p-6`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="buyers" className="text-[22px] font-semibold">
          Compute buyers
        </h2>
        {live.status === "live" && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#06b6d4]">
            <span className="inline-block size-2 rounded-full bg-[#06b6d4]" /> live
          </span>
        )}
      </div>
      {!source && (
        <p className="mt-4 text-[15px] text-white/55">
          Live data needs the local stack: run make dev. The figures above are the model&apos;s.
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
          <p className="mt-1 text-[15px] text-white/55">
            <Sourced
              source={
                <>
                  <code>public.buyers</code> and <code>public.jobs</code> in Supabase, read as the
                  operator. The buyers and jobs are synthetic (supabase/seed.sql).
                </>
              }
            >
              {rows.length} buyers · {running} jobs running now
            </Sourced>
          </p>
          <ul className="mt-4 flex-1 space-y-3.5 overflow-auto">
            {rows.map((r) => (
              <li key={r.buyer.id} data-buyer={r.buyer.id}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-[17px] font-semibold text-[#22d3ee]">{r.buyer.name}</span>
                  <span className="text-[14px] text-white/55 tabular-nums">
                    {r.jobs.length} jobs
                  </span>
                </p>
                <p className="text-[13px] text-white/50">{r.buyer.buys}</p>
                <p className="mt-0.5 text-[13px] text-white/70 tabular-nums">
                  {r.running} running · {r.paused} paused · {r.queued} queued
                  {r.done > 0 && ` · ${r.done} done`}
                  {r.offsite > 0 && ` · ${r.offsite} to a data centre`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
