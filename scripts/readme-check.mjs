#!/usr/bin/env node
// Fails if the README promises what the code does not do yet.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BANNED = ["planned", "todo", "coming soon", "wip", "roadmap"];

/** Each banned word found in the text, with its line number. */
export function bannedWords(text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    for (const word of BANNED) {
      if (new RegExp(`\\b${word}\\b`, "i").test(line)) found.push({ line: i + 1, word });
    }
  });
  return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? "README.md";
  const found = bannedWords(readFileSync(path, "utf8"));
  for (const { line, word } of found) console.error(`${path}:${line}: "${word}" is not allowed`);
  if (found.length > 0) process.exit(1);
  console.log(`${path}: no banned words`);
}
