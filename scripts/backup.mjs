#!/usr/bin/env node
/**
 * Backup all InstantDB data to a local directory.
 *
 * Usage:
 *   node scripts/backup.mjs [output-dir]
 *
 * Requires in .env.local:
 *   VITE_INSTANT_APP_ID=...
 *   INSTANT_APP_ADMIN_TOKEN=...  ← get from instantdb.com/dash → App Settings
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── env ──────────────────────────────────────────────────────────────────────

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

if (!APP_ID) {
  console.error("❌  VITE_INSTANT_APP_ID not found in .env.local");
  process.exit(1);
}
if (!ADMIN_TOKEN) {
  console.error("❌  INSTANT_APP_ADMIN_TOKEN not found in .env.local");
  console.error(
    "    Get it at: https://instantdb.com/dash → your app → App Settings → Admin Token",
  );
  process.exit(1);
}

// ── output dir ───────────────────────────────────────────────────────────────

const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
const OUT_DIR = process.argv[2] ?? join(ROOT, `backup-${timestamp}`);
const FILES_DIR = join(OUT_DIR, "files");

mkdirSync(FILES_DIR, { recursive: true });
console.log(`📁  Output: ${OUT_DIR}\n`);

// ── query ────────────────────────────────────────────────────────────────────

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

console.log("🔍  Querying InstantDB...");
const data = await db.query({
  // cards carry their line membership + history inline as `queues` / `log` JSON,
  // so dumping the cards captures the whole learning state.
  cards: { image: {} },
  lightCards: { image: {} },
  lines: {},
  // Example sentences, and the join that attaches one to a card. The join
  // carries the span data, so it has to be dumped in its own right — see the
  // `exampleLinks` note in src/instant.schema.ts.
  examples: {},
  exampleLinks: { card: {}, example: {} },
  // Legacy single-line tables — still dumped so pre-migration state is captured.
  queueEntries: { card: {} },
  cardEvents: {},
});

const cards = data?.cards ?? [];
const lightCards = data?.lightCards ?? [];
const lines = data?.lines ?? [];
const examples = data?.examples ?? [];
// The admin client is initialised without the schema (it lives in TypeScript,
// which this script can't import), so InstantDB doesn't know a link's
// cardinality and hands back even a `has: "one"` side as an array.
const one = (v) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const exampleLinks = (data?.exampleLinks ?? []).map(
  // Both sides come back embedded, which would repeat every card and sentence
  // once per link. The ids are all a restore needs.
  ({ card, example, ...link }) => ({
    ...link,
    cardId: one(card)?.id ?? null,
    exampleId: one(example)?.id ?? null,
  }),
);
const queueEntries = data?.queueEntries ?? [];
const cardEvents = data?.cardEvents ?? [];

console.log(`    cards:        ${cards.length}`);
console.log(`    lightCards:   ${lightCards.length}`);
console.log(`    lines:        ${lines.length}`);
console.log(`    examples:     ${examples.length}`);
console.log(`    exampleLinks: ${exampleLinks.length}`);
console.log(`    queueEntries: ${queueEntries.length}`);
console.log(`    cardEvents:   ${cardEvents.length}\n`);

// ── download images ───────────────────────────────────────────────────────────

const MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
};

let downloaded = 0;
let skipped = 0;
let failed = 0;

async function downloadImage(image) {
  if (!image?.url) return;

  const ext = MIME_EXT[image["content-type"]] ?? ".bin";
  const localName = `${image.id}${ext}`;
  const destPath = join(FILES_DIR, localName);

  if (existsSync(destPath)) {
    image._localFile = localName;
    skipped++;
    return;
  }

  try {
    const res = await fetch(image.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    writeFileSync(destPath, Buffer.from(buf));
    image._localFile = localName;
    downloaded++;
    process.stdout.write(`    ↓ ${localName}\n`);
  } catch (err) {
    console.warn(`    ⚠️  Failed to download ${image.path}: ${err.message}`);
    failed++;
  }
}

const allImages = [
  ...cards.map((c) => c.image).filter(Boolean),
  ...lightCards.map((c) => c.image).filter(Boolean),
].flat();

if (allImages.length > 0) {
  console.log(`⬇️   Downloading ${allImages.length} image(s)...`);
  for (const image of allImages) {
    await downloadImage(image);
  }
  console.log();
}

// ── write JSON ────────────────────────────────────────────────────────────────

const backup = {
  exportedAt: new Date().toISOString(),
  appId: APP_ID,
  cards,
  lightCards,
  lines,
  examples,
  exampleLinks,
  queueEntries,
  cardEvents,
};

const jsonPath = join(OUT_DIR, "data.json");
writeFileSync(jsonPath, JSON.stringify(backup, null, 2), "utf8");

// ── summary ───────────────────────────────────────────────────────────────────

const totalRecords =
  cards.length +
  lightCards.length +
  lines.length +
  examples.length +
  exampleLinks.length +
  queueEntries.length +
  cardEvents.length;
console.log("✅  Done!");
console.log(`    data.json  — ${totalRecords} record(s)`);
console.log(
  `    files/     — ${downloaded} downloaded, ${skipped} already existed${failed ? `, ${failed} failed` : ""}`,
);
