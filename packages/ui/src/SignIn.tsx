import { useEffect, useState, type FormEvent } from "react";

/** What the form and the session hook need from an app's sign-in (@kachel/db: AppAuth). */
export interface Auth {
  current(): Promise<string | null>;
  onChange(listener: (email: string | null) => void): () => void;
  signIn(email: string, password: string): Promise<boolean>;
}

/**
 * The signed-in email, null when nobody is signed in, or undefined while it is not known yet
 * (so an app shows neither the form nor the data for that moment).
 */
export function useSession(auth: Auth): string | null | undefined {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    const stop = auth.onChange((next) => setEmail(next));
    auth.current().then(
      (first) => {
        if (current) setEmail((seen) => (seen === undefined ? first : seen));
      },
      () => {
        if (current) setEmail(null);
      },
    );
    return () => {
      current = false;
      stop();
    };
  }, [auth]);
  return email;
}

type Demo = { email: string; password: string };

/** Email and password form. On the local stack it names the seed's demo account. */
export function SignIn({ auth, heading, demo }: { auth: Auth; heading: string; demo?: Demo }) {
  const [email, setEmail] = useState(demo?.email ?? "");
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
      <h2 className="text-lg font-semibold">{heading}</h2>
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
      {demo && (
        <p className="text-sm text-idle">
          Local demo: {demo.email}, password {demo.password} (from supabase/seed.sql).
        </p>
      )}
    </form>
  );
}
