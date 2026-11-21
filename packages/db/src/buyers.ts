import type { KachelClient } from "./client";
import type { Tables } from "./database.types";

export type LiveBuyer = Pick<Tables<"buyers">, "id" | "name" | "buys" | "synthetic">;

/** Every buyer the signed-in user may read: an operator reads all, a buyer only their own row. */
export async function supabaseBuyers(db: KachelClient): Promise<LiveBuyer[]> {
  const { data, error } = await db.from("buyers").select("id, name, buys, synthetic").order("name");
  if (error) throw new Error("Could not read the buyers.");
  return data;
}
