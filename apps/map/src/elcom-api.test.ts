import { observationsQuery } from "@kachel/economics/elcom";
import { describe, expect, it, vi } from "vitest";
import { elcomHandler, elcomQuery, parseBfs } from "../api/elcom";

const ask = (q: string) => new Request(`https://map.example/api/elcom${q}`);

describe("the /api/elcom function", () => {
  it("sends the same query as the card's package, for one municipality", () => {
    expect(elcomQuery(2701)).toBe(observationsQuery([2701]));
  });

  it("takes a municipality number only", () => {
    expect(parseBfs("2701")).toBe(2701);
    for (const bad of [null, "", "0", "12345", "27a", "1,2", "{ __schema }"])
      expect(parseBfs(bad)).toBeNull();
  });

  it("asks ElCom with the fixed query and lets the answer be cached for a day", async () => {
    const post = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ data: { observations: [] } })),
    );
    const res = await elcomHandler(post)(ask("?bfs=351"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
    const [url, init] = post.mock.calls[0] ?? [];
    expect(url).toBe("https://www.strompreis.elcom.admin.ch/api/graphql");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ query: observationsQuery([351]) });
  });

  it("refuses anything else and never caches a failure", async () => {
    const post = vi.fn<typeof fetch>(() => Promise.reject(new Error("down")));
    expect((await elcomHandler(post)(ask("?query=x"))).status).toBe(400);
    expect(post).not.toHaveBeenCalled();
    const res = await elcomHandler(post)(ask("?bfs=351"));
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("does not cache a GraphQL error, which ElCom sends with status 200", async () => {
    const post = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ errors: [{ message: "bad" }] })),
    );
    const res = await elcomHandler(post)(ask("?bfs=351"));
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
