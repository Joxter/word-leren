// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  $files: {
    allow: {
      view: "true",
      create: "true",
      delete: "true",
    },
  },
  cards: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  examples: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  exampleLinks: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  lightCards: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  lines: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  queueEntries: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  cardEvents: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
} satisfies InstantRules;

export default rules;
