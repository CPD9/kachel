import { useState, type FormEvent } from "react";
import { DEMO_HOST, type HostAuth } from "./session";

/** Email and password form for the host. On the local stack it names the demo account. */
export function SignIn({ auth, local }: { auth: HostAuth; local: boolean }) {
  const [email, setEmail] = useState(local ? DEMO_HOST.email : "");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "wrong" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("busy");
    try {
      setState((await auth.signIn(email, password)) ? "idle" : "wrong");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-6 my-6 flex max-w-sm flex-col gap-3">
      <h2 className="text-lg font-semibold">Sign in to see your servers</h2>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-idle/60 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-idle/60 px-2 py-1"
        />
      </label>
      <button
        type="submit"
        disabled={state === "busy"}
        className="rounded bg-heat px-3 py-1.5 font-medium text-paper disabled:opacity-60"
      >
        {state === "busy" ? "Signing in…" : "Sign in"}
      </button>
      {state === "wrong" && (
        <p role="alert" className="text-sm">
          That email and password do not match.
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-sm">
          Sign-in cannot be reached right now. Is the local database running? Start it with make
          dev.
        </p>
      )}
      {local && (
        <p className="text-sm text-idle">
          Local demo: {DEMO_HOST.email}, password {DEMO_HOST.password} (from supabase/seed.sql).
        </p>
      )}
    </form>
  );
}
