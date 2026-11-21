import { describe, expect, it } from "vitest";
import { duskSky } from "./sky";

describe("dusk sky", () => {
  it("is pink-violet over a blue band at dusk", () => {
    expect(duskSky(0.2)).toBe(
      "linear-gradient(to bottom, rgb(142,128,160) 0%, rgb(196,132,160) 22%, rgb(44,98,160) 36%, rgb(44,98,160) 100%)",
    );
  });

  it("is deep blue at night and stays in range beyond it", () => {
    expect(duskSky(1)).toContain("rgb(12,16,34) 0%");
    expect(duskSky(5)).toBe(duskSky(1));
  });
});
