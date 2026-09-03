/**
 * MCP server over the card deck: what is in it, what happened to it, and the
 * two writes — fixing a card's text and adding a card. Runs on the droplet so Claude can
 * reach the deck from anywhere; a local stdio server would only exist while the
 * laptop is open. See PLAN-inbox.md for the rest of the write half.
 *
 * Run: node --env-file-if-exists=.env.local server/mcp.ts
 * Env: VITE_INSTANT_APP_ID, INSTANT_APP_ADMIN_TOKEN, OWNER_EMAIL, MCP_SECRET, PORT
 *
 * The admin token bypasses permissions entirely, so every query here narrows to
 * one owner by hand — `mine()` in src/lib/session.ts is a browser thing and the
 * rules that back it up do not apply to this connection.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import { id as newId, init } from "@instantdb/admin";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { rankMatches } from "../src/lib/search.ts";
import {
  brief,
  byDay,
  editEvent,
  events,
  tally,
  trimCardText,
  STATE,
  type DeckCard,
} from "../src/lib/deck.ts";

const APP_ID = process.env.VITE_INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_APP_ADMIN_TOKEN;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const SECRET = process.env.MCP_SECRET;
const PORT = Number(process.env.PORT || 8787);
// Loopback by default; the container overrides it, and compose is what decides
// the port is only published to the droplet's loopback.
const HOST = process.env.HOST || "127.0.0.1";

for (const [name, value] of Object.entries({
  VITE_INSTANT_APP_ID: APP_ID,
  INSTANT_APP_ADMIN_TOKEN: ADMIN_TOKEN,
  OWNER_EMAIL,
  MCP_SECRET: SECRET,
})) {
  if (!value) {
    console.error(`missing env: ${name}`);
    process.exit(1);
  }
}
if (SECRET!.length < 24) {
  console.error(
    "MCP_SECRET is the only thing guarding the deck — use 32+ chars",
  );
  process.exit(1);
}

const db = init({ appId: APP_ID!, adminToken: ADMIN_TOKEN! });

// ── data ─────────────────────────────────────────────────────────────────────

let ownerId = "";

async function fetchCards(): Promise<DeckCard[]> {
  const { cards } = await db.query({
    cards: {
      $: { where: { "owner.id": ownerId, deletedAt: { $isNull: true } } },
    },
  });
  return cards as DeckCard[];
}

/** Line ids resolved to names, oldest first. Two rows, fetched per call. The
 *  order is not decoration: `create_card` takes the first as the default line,
 *  the same "oldest line wins" rule as `getDefaultLineId` in the app. */
async function fetchLines(): Promise<Record<string, string>> {
  const { lines } = await db.query({
    lines: {
      $: { where: { "owner.id": ownerId }, order: { createdAt: "asc" } },
    },
  });
  return Object.fromEntries(lines.map((l: any) => [l.id, l.name]));
}

/** Line names known at boot, to name them in a tool description. A line added
 *  later still filters — only this list goes stale, until a restart. */
let lineNames: string[] = [];

/** A line id by name, case-insensitively — the tools take names, the cards
 *  store ids. */
const findLine = (lines: Record<string, string>, name: string) =>
  Object.keys(lines).find((k) => lines[k].toLowerCase() === name.toLowerCase());

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }],
});

// ── tools ────────────────────────────────────────────────────────────────────

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "word-leren", version: "0.1.0" },
    {
      instructions:
        "A personal Dutch flashcard deck (side A is Dutch) and its review history. Reading is free; " +
        "the writes are `edit_card`, which fixes a card's text and nothing else, and `create_card`, which adds one. " +
        "The deck is split into lines — separate decks under one account, listed in `search_cards`.",
    },
  );

  server.registerTool(
    "search_cards",
    {
      title: "Search cards",
      description:
        "List or search the deck. Ranked by relevance when `query` is given, by due date otherwise (soonest first, unstudied last). " +
        `The deck is split into lines, which are separate decks sharing one account: ${lineNames.join(", ")}. ` +
        "Most cards are Dutch; the English line is a small side deck and holds most of the half-finished rows.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Matches side A, then side B. Notes are not searched"),
        state: z
          .enum(["all", "unstudied", "learning", "review", "relearning", "due"])
          .optional()
          .describe("`due` means due now, across every state. Default: all"),
        line: z.string().optional().describe("Restrict to one line, by name"),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, state = "all", line, limit = 50 }) => {
      const now = Date.now();
      const [all, lines] = await Promise.all([fetchCards(), fetchLines()]);
      let cards = all;

      if (line) {
        const id = findLine(lines, line);
        if (!id)
          return ok({ error: "no such line", lines: Object.values(lines) });
        cards = cards.filter((c) => c.queues?.[id]);
      }
      // Counts describe the line, not the state/query filter below — they are
      // here so "how much is due" doesn't cost a query of its own.
      const counts = tally(cards, now);

      if (state === "unstudied") cards = cards.filter((c) => !c.srs);
      else if (state === "due")
        cards = cards.filter((c) => c.srs && c.srs.due <= now);
      else if (state !== "all") {
        const want = STATE.findIndex((s) => s.toLowerCase() === state);
        cards = cards.filter((c) => c.srs?.state === want);
      }
      const matched = cards.length;

      // An empty query means "no text filter" here, not "match nothing" — this
      // is a list tool as much as a search one, so rankMatches only runs when
      // there is something to rank. Notes are out of the fields on purpose:
      // they carry whole dictionary entries, and a short word like "rooster"
      // matched half the deck through somebody else's example sentence.
      const q = query?.trim();
      // Ranked unlimited and sliced after, so `matched` is the honest number of
      // hits rather than however many fit under `limit`.
      const hits = q
        ? rankMatches(cards, q, {
            fields: (c) => [c.aCard, c.bCard],
            label: (c) => c.aCard,
          })
        : cards.sort(
            (a, b) => (a.srs?.due ?? Infinity) - (b.srs?.due ?? Infinity),
          );
      const rows = hits.slice(0, limit);

      return ok({
        deckSize: all.length,
        counts,
        matched: q ? hits.length : matched,
        returned: rows.length,
        cards: rows.map((c) => brief(c, lines)),
      });
    },
  );

  server.registerTool(
    "get_card",
    {
      title: "Get card",
      description:
        "One card in full: scheduling state, example sentences it appears in, and its whole event log. " +
        "`note` and `examples` are different things: the note is free text, usually a pasted dictionary " +
        "entry, and the sentences in it are not examples. `examples` are sentence rows shared across cards, " +
        "each with the fragments blanked out for this one.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { cards } = await db.query({
        cards: {
          $: {
            where: { id, "owner.id": ownerId, deletedAt: { $isNull: true } },
          },
          exampleLinks: { example: {} },
        },
      });
      const card = cards[0] as
        (DeckCard & { exampleLinks?: any[] }) | undefined;
      if (!card) return ok({ error: "no such card" });
      const lines = await fetchLines();

      return ok({
        ...brief(card, lines),
        note: card.note || undefined,
        // The admin SDK returns *every* nested link as an array, `has: one`
        // included — unlike the react client, where `l.example` is the object.
        // Reading it as an object silently yields undefined, not an error.
        examples: (card.exampleLinks ?? []).map((l) => ({
          text: l.example?.[0]?.aText,
          translation: l.example?.[0]?.bText || undefined,
          // Which fragments of the sentence are blanked out for this card.
          blanks: (l.spans ?? []).map((s: any) => s.text),
        })),
        history: events([card], lines),
      });
    },
  );

  server.registerTool(
    "review_history",
    {
      title: "Review history",
      description:
        "What was studied and when, newest first, plus a per-day summary. Events: `rate` (answered, `grade` is Again/Hard/Good/Easy), `introduce` (taken into study), `known` (marked known on sight), `create` (card added) and `edit` (card text changed). `via` says where a write came from — `mcp` is this connection, absent is the app. The retired manual queue's own events (`place`/`top`/`move`, up to 2026-08-28) are still in the database but left out here.",
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Default 14"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Default 200 events"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ days = 14, limit = 200 }) => {
      // Whole calendar days, not a rolling window: `days: 1` means today, and
      // the oldest bucket in `byDay` is a full day rather than a silently
      // truncated one.
      const midnight = new Date().setHours(0, 0, 0, 0);
      const since = midnight - (days - 1) * 864e5;
      const [cards, lines] = await Promise.all([fetchCards(), fetchLines()]);
      const all = events(cards, lines).filter((e) => e.at >= since);

      return ok({
        since: new Date(since).toISOString(),
        total: all.length,
        returned: Math.min(all.length, limit),
        byDay: byDay(all),
        events: all.slice(0, limit),
      });
    },
  );

  server.registerTool(
    "edit_card",
    {
      title: "Edit card",
      description:
        "Fix a card's text: side A, side B, the note, or any combination. Only the fields you pass change. " +
        "Scheduling is not touched — an edit never moves a card's due date, and a card whose word changes " +
        "completely is a new card, not an edit. Each field replaces the old value whole, so to add a line to " +
        "a note, read it with `get_card` and pass it back with the line in it. " +
        "A note often ends in a `{% dict %} … {% /dict %}` block: that is a dictionary entry the app pastes " +
        "in and refills, so keep it as it is and write above it. " +
        "The edit is logged and shows up in the card's history.",
      inputSchema: {
        id: z.string(),
        aCard: z.string().optional().describe("Side A — the Dutch word"),
        bCard: z.string().optional().describe("Side B — the translation"),
        note: z
          .string()
          .optional()
          .describe("Free text under the card, Markdoc. Replaces the old note"),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, aCard, bCard, note }) => {
      const { cards } = await db.query({
        cards: {
          $: {
            where: { id, "owner.id": ownerId, deletedAt: { $isNull: true } },
          },
        },
      });
      const card = cards[0] as DeckCard | undefined;
      if (!card) return ok({ error: "no such card" });

      const text = trimCardText({
        aCard: aCard ?? card.aCard,
        bCard: bCard ?? card.bCard,
        note: note ?? card.note ?? "",
      });
      // A card with a blank side is unanswerable, and the app's own form is
      // what usually stops that — this connection goes around it. Only what the
      // caller sent is judged: half-finished rows with an empty side already
      // exist (most of the English line), and they must stay editable.
      if (
        (aCard !== undefined && !text.aCard) ||
        (bCard !== undefined && !text.bCard)
      )
        return ok({ error: "a side you are editing can't be left empty" });

      const event = editEvent(card, text, "mcp");
      if (!event) return ok({ id, changed: [], note: "nothing to change" });
      // Only the changed fields are written. Sending all three would have this
      // edit overwrite whatever a Save in the open app wrote a second ago —
      // with the text this request read *before* that save.
      const changes = Object.fromEntries(event.fields.map((f) => [f, text[f]]));
      await db.transact([
        db.tx.cards[id].update(changes),
        // `merge`, not `update` — the log is one JSON blob and an update would
        // replace the whole history with this single event.
        db.tx.cards[id].merge({ log: { [newId()]: event } }),
      ]);

      // `text` is the stored row plus exactly `changes`, so it is the card as
      // it now stands.
      return ok({ id, changed: event.fields, card: text });
    },
  );

  server.registerTool(
    "create_card",
    {
      title: "Create card",
      description:
        "Add a card to the deck. It lands at the top of a line's new-card pool and is created *unstudied*: " +
        "it has no schedule until it is taken into study from the app, so creating cards never adds anything due today. " +
        "Side A is the word being learned (Dutch, unless the line says otherwise), side B its translation. " +
        "A card whose side A already exists is refused — edit that one with `edit_card` instead of making a second. " +
        "The note is free text (Markdoc); the app's own `{% dict %}` dictionary block is filled in there, not here. " +
        "Examples, images and audio can't be attached from here.",
      inputSchema: {
        aCard: z.string().describe("Side A — the word being learned"),
        bCard: z.string().describe("Side B — the translation"),
        note: z
          .string()
          .optional()
          .describe("Free text under the card, Markdoc"),
        line: z
          .string()
          .optional()
          .describe(
            `Which line to add it to, by name. Default: ${lineNames[0] ?? "the oldest line"}`,
          ),
        aLang: z.enum(["NL", "EN"]).optional().describe("Default NL"),
        bLang: z.enum(["EN", "RU"]).optional().describe("Default EN"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ aCard, bCard, note, line, aLang = "NL", bLang = "EN" }) => {
      const text = trimCardText({ aCard, bCard, note: note ?? "" });
      // The app's form can't submit a blank side; this connection goes around
      // it, and a card with one side is unanswerable. (`edit_card` is laxer on
      // purpose — half-finished rows already exist and stay editable.)
      if (!text.aCard || !text.bCard)
        return ok({ error: "both sides are required" });

      const [cards, lines] = await Promise.all([fetchCards(), fetchLines()]);
      // Object key order is insertion order, and fetchLines asks for oldest
      // first — so this is the app's default line.
      const lineId = line ? findLine(lines, line) : Object.keys(lines)[0];
      if (!lineId)
        return ok({ error: "no such line", lines: Object.values(lines) });

      // Cheap duplicate guard: the deck is small enough that it is already in
      // memory, and a chat that can't see the deck is exactly what re-adds a
      // word it added last week. Side A only — the same Dutch word twice is a
      // duplicate however the translations differ.
      const dup = cards.find(
        (c) => c.aCard.toLowerCase() === text.aCard.toLowerCase(),
      );
      if (dup)
        return ok({
          error: "a card with this side A exists",
          card: brief(dup, lines),
        });

      // Straight to the top of the line. The app's `enqueueTop` instead slots
      // new cards between non-fresh ones, but that lives in lib/queue.ts, which
      // opens a socket on import — and the line order only decides what the
      // Deck page offers first now that FSRS does the scheduling.
      // ponytail: plain top; port `topInsertRank` here if the pool ever clumps.
      const ranks = cards
        .map((c) => c.queues?.[lineId]?.rank)
        .filter((r): r is string => !!r);
      const top = ranks.length ? ranks.reduce((a, b) => (a < b ? a : b)) : null;

      const cardId = newId();
      await db.transact(
        db.tx.cards[cardId]
          .update({
            aLang,
            bLang,
            ...text,
            queues: { [lineId]: { rank: generateKeyBetween(null, top) } },
            log: {
              [newId()]: {
                at: Date.now(),
                lineId,
                kind: "create",
                amount: 1,
                // Without this the history can't tell a card added from the
                // chat from one typed into the app.
                via: "mcp",
              },
            },
          })
          // No owner link, no readable row — the admin token writes past the
          // permissions that would have caught this.
          .link({ owner: ownerId }),
      );

      return ok({ id: cardId, line: lines[lineId], card: text });
    },
  );

  return server;
}

// ── http ─────────────────────────────────────────────────────────────────────

/** The whole authentication story: a secret in the path. Anyone who learns the
 *  URL can read the deck; rotating it means changing the env and the connector.
 *  An OAuth server for a single user would be more code than the server. */
function authorised(url: string): boolean {
  const got = url
    .split("?")[0]
    .replace(/^\/mcp\//, "")
    .replace(/\/$/, "");
  const [a, b] = [Buffer.from(got), Buffer.from(SECRET!)];
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (!req.url?.startsWith("/mcp/") || !authorised(req.url)) {
    res.writeHead(404).end();
    return;
  }

  // Stateless: a fresh server and transport per request, so nothing is kept
  // between calls and a restart costs no reconnection.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = buildServer();
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

const { $users } = await db.query({
  $users: { $: { where: { email: OWNER_EMAIL } } },
});
if (!$users.length) {
  console.error(`no account for OWNER_EMAIL=${OWNER_EMAIL}`);
  process.exit(1);
}
ownerId = $users[0].id;
lineNames = Object.values(await fetchLines());

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end();
  });
}).listen(PORT, HOST, () =>
  console.log(`word-leren MCP on ${HOST}:${PORT}, path /mcp/<secret>`),
);
