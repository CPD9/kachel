import { expect, it } from "vitest";
import { cardEgid } from "./start";

it("reads the building to open from ?egid= with ?card=1", () => {
  expect(cardEgid("?egid=442141&card=1")).toBe(442141);
  expect(cardEgid("?card=1&egid=442141&tour=0")).toBe(442141);
});

it("opens the map as usual without card=1 or a valid EGID", () => {
  expect(cardEgid("?egid=442141")).toBeUndefined();
  expect(cardEgid("?card=1")).toBeUndefined();
  expect(cardEgid("?egid=abc&card=1")).toBeUndefined();
  expect(cardEgid("?egid=-4&card=1")).toBeUndefined();
  expect(cardEgid("")).toBeUndefined();
});
