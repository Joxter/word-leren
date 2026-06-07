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
    }),
    lightCards: i.entity({
      text: i.string(),
    }),
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
