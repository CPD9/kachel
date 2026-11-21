import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type KachelClient = SupabaseClient<Database>;

/**
 * A Supabase client typed by the schema in supabase/migrations.
 * Apps pass the anon or publishable key; only the agent ever holds the service role key.
 */
export function createKachelClient(url: string | undefined, key: string | undefined): KachelClient {
  if (!url || !key) {
    throw new Error(
      "Supabase URL or key is missing: copy .env.example to .env and fill it from `pnpm exec supabase status -o env`.",
    );
  }
  return createClient<Database>(url, key);
}
