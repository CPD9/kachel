#!/usr/bin/env node
// Screenshots of the running host app and console for the README, with headless Chromium.
// Start the local stack and both apps first (make db-reset, then make dev), then:
//   pnpm screenshots
// Writes docs/media/app-host.png and docs/media/app-console.png.
//
// Each app is signed in with the seed's demo account (supabase/seed.sql), so the script only
// runs against apps on this machine. It uses the Chromium Playwright installed
// (pnpm exec playwright-core install chromium) or the one at $CHROMIUM, such as
// /usr/bin/chromium, and always starts its own headless browser.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

/** The seed's demo password for both accounts; it exists only on the local stack. */
const SEED_PASSWORD = "kachel-demo";

export const SHOTS = [
  { name: "app-host", url: process.env.HOST_URL ?? "http://localhost:5173/" },
  { name: "app-console", url: process.env.CONSOLE_URL ?? "http://localhost:5174/" },
];

const OUT = "docs/media";

/** True for an app served from this machine, the only place the seed's accounts exist. */
export function isLocal(url) {
  return ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
}

async function shoot(page, shot) {
  await page.goto(shot.url, { waitUntil: "networkidle" });
  // Each app prefills the demo account's email on the local stack; give it the seed password.
  // The app first asks Supabase for a session and shows neither; wait for the form or the data.
  const signIn = page.getByRole("button", { name: "Sign in" });
  const live = page.getByText("· live").first();
  await signIn.or(live).first().waitFor({ timeout: 15_000 });
  if (await signIn.isVisible()) {
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await signIn.click();
  }
  // Ready once the live data has loaded.
  await live.waitFor({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  const path = `${OUT}/${shot.name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`${path} from ${shot.url}`);
}

async function main() {
  const remote = SHOTS.filter((s) => !isLocal(s.url));
  if (remote.length) throw new Error(`only apps on this machine: ${remote.map((s) => s.url)}`);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    // Chromium formats a date input in its own UI language, not the page's or the context's
    // locale, so en-GB here is what turns mm/dd/yyyy into dd/mm/yyyy.
    args: ["--lang=en-GB"],
    env: { ...process.env, LANG: "en_GB.UTF-8", LANGUAGE: "en_GB" },
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  });
  try {
    for (const shot of SHOTS) {
      // A fresh context per app, so no session carries over from one to the other.
      const context = await browser.newContext({
        // Short, so the full-page shot ends where the content does.
        viewport: { width: 1280, height: 400 },
        locale: "en-GB",
        timezoneId: "Europe/Zurich",
        deviceScaleFactor: 2,
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await shoot(await context.newPage(), shot);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Screenshots failed: ${error.message}`);
  console.error("Are the local stack and both apps running? Start them with make dev.");
  process.exit(1);
});
