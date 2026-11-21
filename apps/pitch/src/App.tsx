import { Globe } from "./Globe";

/** Pitch app: the Kachel pitch, opening on a rotating globe. */
export function App() {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-black p-4 text-center text-white">
        <p>
          Set <code>VITE_MAPBOX_TOKEN</code> in <code>apps/pitch/.env</code> and restart the dev
          server.
        </p>
      </main>
    );
  }
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <Globe token={token} />
    </main>
  );
}
