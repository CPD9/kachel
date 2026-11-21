import type { KachelClient } from "@kachel/db";

/** Who is signed in to the host screen: Supabase Auth in the app, a fake in tests. */
export interface HostAuth {
  /** The signed-in host's email, or null. */
  current(): Promise<string | null>;
  /** Calls back whenever someone signs in or out; returns a function that stops listening. */
  onChange(listener: (email: string | null) => void): () => void;
  /** Resolves false when the email or password is wrong, without saying which. */
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
}

/** Email and password sign-in on Supabase Auth. Row level security (#3) does the rest. */
export function supabaseAuth(db: KachelClient): HostAuth {
  return {
    async current() {
      const { data } = await db.auth.getSession();
      return data.session?.user.email ?? null;
    },
    onChange(listener) {
      const { data } = db.auth.onAuthStateChange((_event, session) => {
        listener(session?.user.email ?? null);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error === null) return true;
      // A wrong password is a 400; anything else (no stack, network) is not the user's fault.
      if (error.status === 400) return false;
      throw new Error("Sign-in failed.");
    },
    async signOut() {
      await db.auth.signOut();
    },
  };
}

/** The seed's demo host (supabase/seed.sql). Shown only when the app talks to a local stack. */
export const DEMO_HOST = { email: "host@kachel.test", password: "kachel-demo" } as const;

/** True for the local Supabase stack from `make dev`, where the seed's demo accounts exist. */
export function isLocalStack(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
