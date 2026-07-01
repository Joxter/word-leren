#!/usr/bin/env node
/**
 * One-time migration: move the single global learning line into the new
 * multi-line model.
 *
 * Before: each card had one `queueEntries` row with a `rank`.
 * After:  each card stores `queues[lineId] = { rank }` on itself, and lines are
 *         real `lines` records. This script creates a line called "default" and
 *         copies every queueEntry's rank into its card under that line.
 *
 * Safe to re-run: it reuses an existing "default" line and merges ranks (it does
 * not touch other lines a card may already be in).
 *
 * Usage:
 *   node scripts/migrate-lines.mjs
 *
 * Requires in .env.local:
 *   VITE_INSTANT_APP_ID=...
 *   INSTANT_APP_ADMIN_TOKEN=...
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init, id } from "@instantdb/admin";

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
    "❌  Need VITE_INSTANT_APP_ID and INSTANT_APP_ADMIN_TOKEN in .env.local",
  );
  process.exit(1);
}

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

// ── find or create the default line ──────────────────────────────────────────

const { lines = [] } = await db.query({ lines: {} });
let defaultLine = lines.find((l) => l.name === "default");

if (!defaultLine) {
  const lineId = id();
  await db.transact(
    db.tx.lines[lineId].update({ name: "default", createdAt: Date.now() }),
  );
  defaultLine = { id: lineId, name: "default" };
  console.log(`✨  Created line "default" (${lineId})`);
} else {
  console.log(`↺  Reusing existing line "default" (${defaultLine.id})`);
}

const lineId = defaultLine.id;

// ── copy each card's queueEntry rank onto the card itself ────────────────────
// Queried from the card side so `card.id` (a real entity id) is always present;
// the reverse `queueEntry` link carries the old rank.

const { cards = [] } = await db.query({ cards: { queueEntry: {} } });

let migrated = 0;
let skipped = 0;

const ops = [];
for (const card of cards) {
  // The admin SDK returns links as arrays, even for has:one, so take [0].
  const rank = card.queueEntry?.[0]?.rank;
  if (!rank) {
    skipped++;
    continue;
  }
  ops.push(
    db.tx.cards[card.id].merge({ queues: { [lineId]: { rank } } }),
  );
  migrated++;
}

if (ops.length > 0) await db.transact(ops);

console.log(`\n✅  Migrated ${migrated} card(s) into line "default".`);
if (skipped > 0) {
  console.log(`   (${skipped} card(s) had no queue entry and were skipped.)`);
}
console.log(
  "\nVerify the Learn/Line pages, then you can drop the queueEntries and\n" +
    "cardEvents entities from the schema.",
);
