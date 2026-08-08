#!/usr/bin/env node
/**
 * Give every existing row an owner.
 *
 * The app was single-user with wide-open permissions; the new rules hand a row
 * to whoever its `owner` link points at, so anything written before that link
 * existed would be invisible to everybody. This walks every namespace and links
 * the ownerless rows to one account.
 *
 * Run it *after* `push schema` (the `owner` links have to exist) and *before*
 * `push perms` (the admin token bypasses permissions, but the app in your
 * browser does not — locking down first means staring at an empty app until
 * this finishes).
 *
 * It also drops `queueEntries` and `cardEvents`. Both are dead: ranks moved
 * into `cards.queues` and history into `cards.log` long ago, and no code has
 * read either since.
 *
 * Usage:
 *   node scripts/migrate-owner.mjs <owner-email> [--dry]
 *
 * Requires in .env.local:
 *   VITE_INSTANT_APP_ID=...
 *   INSTANT_APP_ADMIN_TOKEN=...  ← instantdb.com/dash → App Settings
 */

import { readFileSync, existsSync } from "fs";
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

if (!APP_ID || !ADMIN_TOKEN) {
  console.error(
    "❌  VITE_INSTANT_APP_ID / INSTANT_APP_ADMIN_TOKEN missing from .env.local",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const EMAIL = args.find((a) => !a.startsWith("--"));

if (!EMAIL) {
  console.error("Usage: node scripts/migrate-owner.mjs <owner-email> [--dry]");
  process.exit(1);
}

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

// ── the account everything moves to ──────────────────────────────────────────

// An address that has never signed in has no `$users` row yet. `getUser` is of
// two minds about that — the types promise a throw, the implementation returns
// null — so treat either as "not found".
async function findUser(email) {
  try {
    return (await db.auth.getUser({ email })) ?? null;
  } catch {
    return null;
  }
}

let user = await findUser(EMAIL);

if (!user && !DRY) {
  // `createToken` mints a session token for the address, creating the row on
  // the spot as a side effect. The token itself is thrown away — the row is the
  // whole point.
  await db.auth.createToken(EMAIL);
  user = await findUser(EMAIL);
  if (!user) {
    console.error(`❌  Could not create an account for ${EMAIL}`);
    process.exit(1);
  }
}

// A dry run goes on without one, so that "what would this touch?" is answerable
// before the account exists.
console.log(
  user
    ? `👤  Owner: ${user.email} (${user.id})\n`
    : `👤  Owner: ${EMAIL} — no account yet, would be created\n`,
);

// ── what needs one ───────────────────────────────────────────────────────────

const OWNED = ["cards", "lines", "examples", "exampleLinks", "lightCards"];
const LEGACY = ["queueEntries", "cardEvents"];

const data = await db.query({
  ...Object.fromEntries(OWNED.map((ns) => [ns, { owner: {} }])),
  $files: { owner: {} },
});

// Asked for separately, and forgivingly: these two are gone from the schema, so
// a query for them fails outright once the attrs are dropped in the dashboard —
// which must not take the rest of the migration down with it.
const legacyData = {};
for (const ns of LEGACY) {
  try {
    Object.assign(legacyData, await db.query({ [ns]: {} }));
  } catch {
    console.log(`    ${ns.padEnd(13)} already gone`);
  }
}

// Without the schema (it lives in TypeScript, which this script can't import)
// the admin client doesn't know a link's cardinality and returns even a
// `has: "one"` side as an array.
const hasOwner = (row) =>
  Array.isArray(row.owner) ? row.owner.length > 0 : Boolean(row.owner);

// The plan is a list of `[namespace, id, action]` rather than transaction
// chunks: a dry run has to be able to count the work without an owner id to
// build the chunks from.
const plan = [];
for (const ns of [...OWNED, "$files"]) {
  const rows = data[ns] ?? [];
  const orphans = rows.filter((row) => !hasOwner(row));
  console.log(
    `    ${ns.padEnd(13)} ${String(orphans.length).padStart(4)} to link` +
      (orphans.length === rows.length ? "" : ` (${rows.length} total)`),
  );
  for (const row of orphans) plan.push([ns, row.id, "link"]);
}

for (const ns of LEGACY) {
  const rows = legacyData[ns] ?? [];
  if (rows.length === 0) continue;
  console.log(
    `    ${ns.padEnd(13)} ${String(rows.length).padStart(4)} to drop`,
  );
  for (const row of rows) plan.push([ns, row.id, "drop"]);
}

console.log(`\n📦  ${plan.length} operations`);

if (plan.length === 0) {
  console.log("✅  Nothing to do.");
  process.exit(0);
}
if (DRY) {
  console.log("🔎  Dry run — nothing written.");
  process.exit(0);
}

// ── write ────────────────────────────────────────────────────────────────────

const ops = plan.map(([ns, rowId, action]) =>
  action === "link"
    ? db.tx[ns][rowId].link({ owner: user.id })
    : db.tx[ns][rowId].delete(),
);

// One transaction per chunk. A partial run is not a problem: linking an owner
// twice is a no-op, so the fix for an interrupted migration is to run it again.
const CHUNK = 200;
for (let i = 0; i < ops.length; i += CHUNK) {
  await db.transact(ops.slice(i, i + CHUNK));
  console.log(`    ${Math.min(i + CHUNK, ops.length)}/${ops.length}`);
}

console.log("\n✅  Done. Now push the permissions:");
console.log("    npx instant-cli@latest push perms");
