#!/usr/bin/env node
/**
 * Seed FSRS memory state (stability / difficulty / lastReviewedAt) on cards
 * from the manual review history.
 *
 * Stability comes from the *last* jump the card got. That jump is the verdict
 * the manual scheduler passed on the card ("show this again in N cards"), and
 * N / (cards reviewed per day) is that verdict in days — which is what
 * stability means.
 *
 *   S = lastJump / rate
 *
 * Note what S must NOT include: the time already elapsed. An earlier version
 * used `S = elapsed + position / rate`, which is a vacuous identity — FSRS
 * crosses R = 0.9 exactly at t = S, so an S built to always exceed the elapsed
 * time puts every single card above 90% recall. Keeping S independent of
 * elapsed is what makes R say something.
 *
 * Difficulty comes from the *shape* of the history: the share of reviews that
 * needed a short re-show (a jump of 50 or less, i.e. same-day drilling) maps
 * onto FSRS's 1-10 scale. Replaying the whole history through `next_state`
 * was tried and rejected — 58% of all reviews are short drill jumps, and FSRS
 * reads a drill as a failure, so every card came out at D = 10 with S = 0.
 * The share is a summary of the same signal that doesn't compound.
 *
 * Few-review cards have their difficulty shrunk toward the average, so one
 * lucky (or unlucky) jump doesn't declare a card trivial or hopeless.
 *
 * Cards with no review history are left untouched — they stay in the "new"
 * pool (stability null) for the "add N new" button to introduce.
 *
 * Re-runnable: seeding is derived from the logs, so it recomputes and
 * overwrites. Cards that carry a real FSRS `rate` event are skipped — an
 * answer you actually gave always beats a guess from the old history — unless
 * `--force`, for when those answers were themselves given against a seeding
 * since found to be wrong.
 *
 * Usage:
 *   node scripts/migrate-fsrs.mjs           # dry run: preview + fsrs-preview.tsv
 *   node scripts/migrate-fsrs.mjs --apply   # write the state
 *   node scripts/migrate-fsrs.mjs --rate 50 # override reviews/day (default 70)
 *   node scripts/migrate-fsrs.mjs --force   # reseed rated cards too
 *
 * Requires VITE_INSTANT_APP_ID + INSTANT_APP_ADMIN_TOKEN in .env.local.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { fsrs } from "ts-fsrs";

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
const FORCE = args.includes("--force");
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

const { cards } = await db.query({ cards: {} });
const now = Date.now();
const DAY = 864e5;

// A jump this short means "show it again today" — drilling, not scheduling.
const DRILL = 50;
// Virtual reviews pulling a short history's difficulty toward the average.
const SHRINK = 3;

/** The card's manual reviews, oldest first. */
function reviewsOf(card) {
  return Object.values(card.log ?? {})
    .filter((e) => e.kind === "place" && e.amount > 1)
    .sort((a, b) => a.at - b.at);
}

/** Has the card been answered under FSRS proper? Then it needs no seeding. */
function hasRealRating(card) {
  return Object.values(card.log ?? {}).some((e) => e.kind === "rate");
}

/**
 * When the card was last in front of you, by any scheduler. S and D come from
 * the manual jumps alone, but "how long ago" must count an FSRS rating too, or
 * a card reseeded under --force would be called stale the day after you
 * answered it.
 */
function lastSeenAt(card) {
  let at = 0;
  for (const e of Object.values(card.log ?? {})) {
    if (isReviewEvent(e) && e.at > at) at = e.at;
  }
  return at;
}

const isReviewEvent = (e) =>
  (e.kind === "place" && e.amount > 1) || e.kind === "rate";

// The average drill share across cards, used as the prior for short histories.
const shares = cards
  .map(reviewsOf)
  .filter((evs) => evs.length > 0)
  .map((evs) => evs.filter((e) => e.amount <= DRILL).length / evs.length);
const MEAN_SHARE = shares.reduce((a, b) => a + b, 0) / (shares.length || 1);

// ── the plan ─────────────────────────────────────────────────────────────────

const plan = [];
let skippedRated = 0;
let skippedNew = 0;
for (const c of cards) {
  if (hasRealRating(c) && !FORCE) {
    skippedRated++;
    continue;
  }
  const evs = reviewsOf(c);
  if (evs.length === 0) {
    skippedNew++;
    continue;
  }
  const last = evs[evs.length - 1];
  // Half a day is the floor: even the shortest jump means "later", not "now".
  const stability = Math.max(0.5, last.amount / RATE);
  const drills = evs.filter((e) => e.amount <= DRILL).length;
  const share = (drills + SHRINK * MEAN_SHARE) / (evs.length + SHRINK);
  const difficulty = Math.min(10, Math.max(1, 1 + 9 * share));
  const elapsed = (now - lastSeenAt(c)) / DAY;
  plan.push({
    card: c,
    elapsed,
    stability,
    difficulty,
    reviews: evs.length,
    retrievability: scheduler.forgetting_curve(elapsed, stability),
  });
}

// ── preview ──────────────────────────────────────────────────────────────────

plan.sort((a, b) => a.retrievability - b.retrievability);

const fmt = (p, newPos) =>
  [
    String(newPos).padStart(4),
    p.retrievability.toFixed(3).padStart(6),
    p.stability.toFixed(1).padStart(6),
    p.difficulty.toFixed(1).padStart(5),
    String(p.reviews).padStart(4),
    p.elapsed.toFixed(0).padStart(5),
    p.card.aCard.slice(0, 40),
  ].join("  ");

console.log(`rate: ${RATE} reviews/day, mean drill share ${MEAN_SHARE.toFixed(2)}`);
console.log(
  `to seed: ${plan.length}   already rated: ${skippedRated}   left new: ${skippedNew}\n`,
);
console.log(" pos       R       S     D   n   ago  card");
for (const [i, p] of plan.slice(0, 25).entries()) console.log(fmt(p, i + 1));
console.log("  …");
for (const [i, p] of plan.slice(-5).entries())
  console.log(fmt(p, plan.length - 4 + i));

// The spread is the whole point of this seeding — print it, so a rerun that
// flattens it out is obvious rather than something to discover in the app.
const at = (arr, q) => arr[Math.floor(q * (arr.length - 1))];
const Rs = plan.map((p) => p.retrievability);
const Ds = plan.map((p) => p.difficulty).sort((a, b) => a - b);
console.log(
  `\nR    p10 ${at(Rs, 0.1).toFixed(2)}  p50 ${at(Rs, 0.5).toFixed(2)}  p90 ${at(Rs, 0.9).toFixed(2)}` +
    `   below 0.9: ${Rs.filter((r) => r < 0.9).length}/${Rs.length}`,
);
console.log(
  `D    p10 ${at(Ds, 0.1).toFixed(1)}  p50 ${at(Ds, 0.5).toFixed(1)}  p90 ${at(Ds, 0.9).toFixed(1)}`,
);

const tsv = [
  "pos\tR\tS\tD\treviews\telapsedDays\taCard\tbCard",
  ...plan.map((p, i) =>
    [
      i + 1,
      p.retrievability.toFixed(4),
      p.stability.toFixed(2),
      p.difficulty.toFixed(2),
      p.reviews,
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
        difficulty: p.difficulty,
        lastReviewedAt: now - p.elapsed * DAY,
      }),
    ),
  );
  console.log(`  wrote ${Math.min(i + CHUNK, plan.length)}/${plan.length}`);
}
console.log("✅  done");
