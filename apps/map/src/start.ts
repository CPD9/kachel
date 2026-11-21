/**
 * `?egid=442141&card=1` opens the map at that building with its card, as the pitch app's hand-over
 * does (apps/pitch). Without `card=1`, or with an EGID that is not a positive whole number, the
 * map opens as usual.
 */
export function cardEgid(search: string): number | undefined {
  const params = new URLSearchParams(search);
  if (params.get("card") !== "1") return undefined;
  const egid = Number(params.get("egid"));
  return Number.isInteger(egid) && egid > 0 ? egid : undefined;
}
