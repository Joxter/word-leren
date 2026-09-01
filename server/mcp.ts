/**
 * Read-only MCP server over the card deck: what is in it, and what happened to
 * it. Runs on the droplet so Claude can reach the deck from anywhere — a local
 * stdio server would only exist while the laptop is open. See PLAN-inbox.md for
 * the write half, which is deliberately not here yet.
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
import { init } from "@instantdb/admin";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { rankMatches } from "../src/lib/search.ts";
import {
  brief,
  byDay,
  events,
  tally,
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
    cards: { $: { where: { "owner.id": ownerId } } },
  });
  return cards as DeckCard[];
}

/** Line ids resolved to names. Two rows, fetched per call. */
async function fetchLines(): Promise<Record<string, string>> {
  const { lines } = await db.query({
    lines: { $: { where: { "owner.id": ownerId } } },
  });
  return Object.fromEntries(lines.map((l: any) => [l.id, l.name]));
}

/** Line names known at boot, to name them in a tool description. A line added
 *  later still filters — only this list goes stale, until a restart. */
let lineNames: string[] = [];

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }],
});

// ── tools ────────────────────────────────────────────────────────────────────

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "word-leren", version: "0.1.0" },
    {
      instructions:
        "Read-only access to a personal Dutch flashcard deck (side A is Dutch) and its review history. " +
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
        const id = Object.keys(lines).find(
          (k) => lines[k].toLowerCase() === line.toLowerCase(),
        );
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
          $: { where: { id, "owner.id": ownerId } },
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
        "What was studied and when, newest first, plus a per-day summary. Events: `rate` (answered, `grade` is Again/Hard/Good/Easy), `introduce` (taken into study) and `known` (marked known on sight). The retired manual queue's own events (`place`/`top`/`move`, up to 2026-08-28) are still in the database but left out here.",
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
