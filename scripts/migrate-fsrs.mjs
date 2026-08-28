#!/usr/bin/env node
/**
 * Seed FSRS memory state (stability / difficulty / lastReviewedAt) on cards
 * from the hand-built queue order.
 *
 * The idea: a card's position in its line encodes when the manual scheduler
 * meant to show it again — position / (cards reviewed per day) ≈ days from
 * now. Add the time already elapsed since its last review and you get the
 * interval the manual jumps effectively chose, which is what stability is.
 *
 *   S = elapsedDays + position / rate
 *
 * Difficulty starts at the FSRS default (a first "Good" answer), and gets
 * corrected by real reviews from here on. Cards with no reviews or in no line
 * are left untouched — they stay in the "new" pool (stability null).
 *
 * Idempotent: cards that already have a stability are skipped, so it can also
 * repair a partial run.
 *
 * Usage:
 *   node scripts/migrate-fsrs.mjs           # dry run: preview + fsrs-preview.tsv
 *   node scripts/migrate-fsrs.mjs --apply   # write the state
 *   node scripts/migrate-fsrs.mjs --rate 50 # override reviews/day (default 70)
 *
 * Requires VITE_INSTANT_APP_ID + INSTANT_APP_ADMIN_TOKEN in .env.local.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { fsrs, Rating } from "ts-fsrs";

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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const rateArg = args.indexOf("--rate");
// ponytail: fixed reviews/day from the last month's logs; re-run with --rate
// if the pace ever changes before applying.
const RATE = rateArg !== -1 ? Number(args[rateArg + 1]) : 70;
if (!Number.isFinite(RATE) || RATE <= 0) {
  console.error("❌  --rate must be a positive number");
  process.exit(1);
}

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });
const scheduler = fsrs({ enable_fuzz: false });
// The default difficulty: what FSRS assigns after a first "Good".
const DEFAULT_D = scheduler.next_state(null, 0, Rating.Good).difficulty;

const { cards, lines } = await db.query({ cards: {}, lines: {} });
const now = Date.now();
const DAY = 864e5;

// ── per-card facts ───────────────────────────────────────────────────────────

/** Time of the card's last manual review (a "place" deeper than 1), or null. */
function lastReview(card) {
  let at = null;
  for (const e of Object.values(card.log ?? {})) {
    if (e.kind === "place" && e.amount > 1 && (at === null || e.at > at)) {
      at = e.at;
    }
  }
  return at;
}

// Position of every card in every line, 1-indexed top-down by rank.
const positions = new Map(); // cardId -> smallest position across lines
for (const line of lines) {
  const members = cards
    .filter((c) => c.queues?.[line.id]?.rank !== undefined)
    .sort((a, b) => {
      const ra = a.queues[line.id].rank;
      const rb = b.queues[line.id].rank;
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
  members.forEach((c, i) => {
    const pos = i + 1;
    const prev = positions.get(c.id);
    if (prev === undefined || pos < prev) positions.set(c.id, pos);
  });
}

// ── the plan ─────────────────────────────────────────────────────────────────

const plan = [];
let skippedSeeded = 0;
let skippedNew = 0;
for (const c of cards) {
  if (c.stability != null) {
    skippedSeeded++;
    continue;
  }
  const at = lastReview(c);
  const pos = positions.get(c.id);
  if (at === null || pos === undefined) {
    skippedNew++;
    continue;
  }
  const elapsed = (now - at) / DAY;
  const stability = Math.max(0.1, elapsed + pos / RATE);
  const retrievability = scheduler.forgetting_curve(elapsed, stability);
  plan.push({ card: c, pos, elapsed, stability, retrievability });
}

// ── preview ──────────────────────────────────────────────────────────────────

plan.sort((a, b) => a.retrievability - b.retrievability);

const fmt = (p, newPos) =>
  [
    String(newPos).padStart(4),
    String(p.pos).padStart(6),
    p.retrievability.toFixed(3).padStart(6),
    p.stability.toFixed(1).padStart(6),
    p.elapsed.toFixed(1).padStart(6),
    p.card.aCard.slice(0, 40),
  ].join("  ");

console.log(`rate: ${RATE} reviews/day, default difficulty ${DEFAULT_D.toFixed(2)}`);
console.log(
  `to seed: ${plan.length}   already seeded: ${skippedSeeded}   left new: ${skippedNew}\n`,
);
console.log(" new  in-line       R       S   days  card");
for (const [i, p] of plan.slice(0, 30).entries()) console.log(fmt(p, i + 1));
console.log("  …");
for (const [i, p] of plan.slice(-5).entries())
  console.log(fmt(p, plan.length - 4 + i));

// Biggest reorders vs the current line, to eyeball what the model disagrees on.
const movers = plan
  .map((p, i) => ({ ...p, newPos: i + 1, jump: p.pos - (i + 1) }))
  .sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump))
  .slice(0, 10);
console.log("\nbiggest movers (in-line → new):");
for (const m of movers)
  console.log(
    `  ${String(m.pos).padStart(4)} → ${String(m.newPos).padStart(4)}  ${m.card.aCard.slice(0, 40)}`,
  );

const tsv = [
  "newPos\tlinePos\tR\tS\telapsedDays\taCard\tbCard",
  ...plan.map((p, i) =>
    [
      i + 1,
      p.pos,
      p.retrievability.toFixed(4),
      p.stability.toFixed(2),
      p.elapsed.toFixed(2),
      p.card.aCard,
      p.card.bCard,
    ].join("\t"),
  ),
].join("\n");
writeFileSync(join(ROOT, "fsrs-preview.tsv"), tsv);
console.log(`\nfull preview → fsrs-preview.tsv`);

// ── apply ────────────────────────────────────────────────────────────────────

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply to seed.");
  process.exit(0);
}

const CHUNK = 100;
for (let i = 0; i < plan.length; i += CHUNK) {
  await db.transact(
    plan.slice(i, i + CHUNK).map((p) =>
      db.tx.cards[p.card.id].update({
        stability: p.stability,
        difficulty: DEFAULT_D,
        lastReviewedAt: lastReview(p.card),
      }),
    ),
  );
  console.log(`  wrote ${Math.min(i + CHUNK, plan.length)}/${plan.length}`);
}
console.log("✅  done");
