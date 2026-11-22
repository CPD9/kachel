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
    <form
      onSubmit={(e) => void submit(e)}
      className="mx-auto my-10 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 text-[#1d1d1f]"
    >
      <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
      <label className="flex flex-col gap-1 text-sm text-[#6e6e73]">
        Email
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 rounded-lg border border-[#d2d2d7] bg-white px-3 text-base text-[#1d1d1f] focus:border-[#0071e3] focus:outline-2 focus:outline-[#0071e3]/30"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-[#6e6e73]">
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 rounded-lg border border-[#d2d2d7] bg-white px-3 text-base text-[#1d1d1f] focus:border-[#0071e3] focus:outline-2 focus:outline-[#0071e3]/30"
        />
      </label>
      <button
        type="submit"
        disabled={state === "busy"}
        className="h-10 rounded-lg bg-[#0071e3] px-4 font-medium text-white hover:bg-[#0077ed] disabled:opacity-60"
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
        <p className="text-sm text-[#6e6e73]">
          Local demo: {demo.email}, password {demo.password} (from supabase/seed.sql).
        </p>
      )}
    </form>
  );
}
