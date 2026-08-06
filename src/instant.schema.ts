// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    cards: i.entity({
      aLang: i.string(),
      bLang: i.string(),
      aCard: i.string(),
      bCard: i.string(),
      note: i.string().optional(),
      // Path to an audio file under public/, e.g. "audio/dict/hond.mp3".
      audio: i.string().optional(),
      // Learning-line membership: one rank per line the card belongs to, keyed
      // by line id. A card can be in many lines at different positions.
      queues: i.json<{ [lineId: string]: { rank: string } }>().optional(),
      // Append-only history of place/move actions, keyed by event id so entries
      // can be merged in without clobbering each other.
      log: i
        .json<{
          [eventId: string]: {
            at: number;
            lineId: string;
            kind: string;
            amount: number;
          };
        }>()
        .optional(),
    }),
    // A named learning line ("the line"). Membership + per-line rank live on the
    // cards themselves (cards.queues), so lines have no direct link to cards.
    lines: i.entity({
      name: i.string(),
      createdAt: i.number().indexed(),
    }),
    // A sentence example. Which fragments are hidden is *not* stored here: it
    // belongs to the (example, card) pair and lives on `exampleLinks`, so one
    // example can serve several cards with different blanks.
    examples: i.entity({
      aLang: i.string(),
      bLang: i.string(),
      aText: i.string(),
      bText: i.string().optional(),
      note: i.string().optional(),
      createdAt: i.number().indexed(),
    }),
    // Joins one card to one example and records which fragments of the
    // example's side A belong to that card — several of them for separable
    // verbs ("ik STA elke dag OP"). Offsets index into `examples.aText`; the
    // `text` copy lets a span be re-anchored after the sentence is edited (see
    // `anchorSpans` in lib/examples.ts). A pair may be linked more than once,
    // which gives two cloze variants of the same sentence for the same card.
    exampleLinks: i.entity({
      spans: i.json<{ start: number; end: number; text: string }[]>(),
      createdAt: i.number().indexed(),
    }),
    lightCards: i.entity({
      text: i.string(),
    }),
    // Legacy single-line storage. Retired in favour of cards.queues; kept only
    // so the migration script can read existing ranks. Safe to drop afterwards.
    queueEntries: i.entity({
      rank: i.string().indexed(),
    }),
    cardEvents: i.entity({
      at: i.number().indexed(),
      kind: i.string(),
      amount: i.number(),
    }),
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $streams: i.entity({
      abortReason: i.string().optional(),
      clientId: i.string().unique().indexed(),
      done: i.boolean().optional(),
      size: i.number().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
  },
  links: {
    cardImage: {
      forward: {
        on: "cards",
        has: "one",
        label: "image",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "card",
        onDelete: "cascade",
      },
    },
    queueEntryCard: {
      forward: {
        on: "queueEntries",
        has: "one",
        label: "card",
        onDelete: "cascade",
      },
      reverse: {
        on: "cards",
        has: "one",
        label: "queueEntry",
      },
    },
    exampleLinkCard: {
      forward: {
        on: "exampleLinks",
        has: "one",
        label: "card",
        onDelete: "cascade",
      },
      reverse: {
        on: "cards",
        has: "many",
        label: "exampleLinks",
      },
    },
    exampleLinkExample: {
      forward: {
        on: "exampleLinks",
        has: "one",
        label: "example",
        onDelete: "cascade",
      },
      reverse: {
        on: "examples",
        has: "many",
        label: "links",
      },
    },
    cardEventCard: {
      forward: {
        on: "cardEvents",
        has: "one",
        label: "card",
        onDelete: "cascade",
      },
      reverse: {
        on: "cards",
        has: "many",
        label: "events",
      },
    },
    lightCardImage: {
      forward: {
        on: "lightCards",
        has: "one",
        label: "image",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "lightCard",
        onDelete: "cascade",
      },
    },
    $streams$files: {
      forward: {
        on: "$streams",
        has: "many",
        label: "$files",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "$stream",
        onDelete: "cascade",
      },
    },
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
