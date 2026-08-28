#!/usr/bin/env node
/**
 * Clear all scheduling state, so every card is "never studied" again.
 *
 * This is the clean slate for the day-based scheduler: no seeding, no guessing
 * intervals from the old manual jumps. Cards come back into study through the
 * Deck page, either taken in one at a time or marked known in bulk.
 *
 * What it deliberately does NOT touch:
 *   - `queues` — line membership and the hand-built ranks. That order is the
 *     way back to the old scheduler if this experiment doesn't stick.
 *   - `log` — the history. It costs nothing to keep and is the only material
 *     a parameter optimizer could ever train on.
 *
 * Usage:
 *   node scripts/reset-srs.mjs           # dry run
 *   node scripts/reset-srs.mjs --apply
 *
 * Requires VITE_INSTANT_APP_ID + INSTANT_APP_ADMIN_TOKEN in .env.local.
 * Run `npm run backup` first.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const env = parseEnvFile(join(ROOT, ".env.local"));
const APP_ID = env.VITE_INSTANT_APP_ID;
const ADMIN_TOKEN = env.INSTANT_APP_ADMIN_TOKEN;
if (!APP_ID || !ADMIN_TOKEN) {
  console.error(
    "❌  VITE_INSTANT_APP_ID / INSTANT_APP_ADMIN_TOKEN missing from .env.local",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

const { cards } = await db.query({ cards: {} });
const dirty = cards.filter(
  (c) =>
    c.srs != null ||
    c.stability != null ||
    c.difficulty != null ||
    c.lastReviewedAt != null,
);

console.log(`cards: ${cards.length}   carrying state: ${dirty.length}`);
console.log(
  `line membership and logs are left alone (${cards.filter((c) => c.queues).length} cards keep their ranks)`,
);

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply.");
  process.exit(0);
}

const CHUNK = 100;
for (let i = 0; i < dirty.length; i += CHUNK) {
  await db.transact(
    dirty.slice(i, i + CHUNK).map((c) =>
      db.tx.cards[c.id].update({
        srs: null,
        stability: null,
        difficulty: null,
        lastReviewedAt: null,
      }),
    ),
  );
  console.log(`  cleared ${Math.min(i + CHUNK, dirty.length)}/${dirty.length}`);
}
console.log("✅  clean slate");
