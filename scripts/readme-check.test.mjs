import assert from "node:assert/strict";
import { test } from "node:test";
import { bannedWords } from "./readme-check.mjs";

test("finds banned words whatever their case", () => {
  assert.deepEqual(bannedWords("Fast.\nComing soon: more.\nA TODO here."), [
    { line: 2, word: "coming soon" },
    { line: 3, word: "todo" },
  ]);
});

test("leaves words that only contain them alone", () => {
  assert.deepEqual(bannedWords("The wiper and the roadmapper are toddlers."), []);
});
