#!/usr/bin/env node
/**
 * Repair line ranks: give every card in every line a fresh, unique, ordered
 * fractional rank. Fixes duplicate ranks (e.g. many "Zz" from a burst of
 * add-to-top calls) that make generateKeyBetween throw during Learn/Line.
 *
 * Current visual order is preserved (ties broken by card id).
 *
 * Usage: node scripts/fix-ranks.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { generateNKeysBetween } from "fractional-indexing";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function parseEnvFile(f) {
  if (!existsSync(f)) return {};
  const env = {};
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}
const env = parseEnvFile(join(ROOT, ".env.local"));
const db = init({
  appId: env.VITE_INSTANT_APP_ID,
  adminToken: env.INSTANT_APP_ADMIN_TOKEN,
});

const { lines = [] } = await db.query({ lines: {} });
const { cards = [] } = await db.query({ cards: {} });

const ops = [];
for (const line of lines) {
  // Sort by current rank, then id, so existing order is preserved and ties are
  // broken deterministically.
  const members = cards
    .filter((c) => c.queues?.[line.id]?.rank !== undefined)
    .map((c) => ({ id: c.id, rank: c.queues[line.id].rank }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

  if (members.length === 0) {
    console.log(`  line "${line.name}": empty, skipped`);
    continue;
  }

  const fresh = generateNKeysBetween(null, null, members.length);
  members.forEach((m, i) => {
    ops.push(db.tx.cards[m.id].merge({ queues: { [line.id]: { rank: fresh[i] } } }));
  });
  console.log(`  line "${line.name}": reranked ${members.length} cards`);
}

if (ops.length > 0) {
  await db.transact(ops);
  console.log(`\n✅  Rewrote ${ops.length} card rank(s).`);
} else {
  console.log("\nNothing to do.");
}
