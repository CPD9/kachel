import { DEMO_BUYER, type AppAuth } from "@kachel/db";

/** Auth a test drives: the demo buyer's password works, anything else does not. */
export function fakeAuth(signedIn: string | null = null): AppAuth {
  const listeners = new Set<(email: string | null) => void>();
  const tell = (email: string | null) => listeners.forEach((l) => l(email));
  return {
    current: () => Promise.resolve(signedIn),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn(email, password) {
      const ok = email === DEMO_BUYER.email && password === DEMO_BUYER.password;
      if (ok) tell(email);
      return ok;
    },
    async signOut() {
      tell(null);
    },
  };
}
