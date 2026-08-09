// Docs: https://www.instantdb.com/docs/permissions
//
// Every account is an island: you can only touch rows whose `owner` link points
// at you. Anything not named below is denied by `$default`, so a new entity in
// the schema needs a rule here or it will look broken rather than error.

import type { InstantRules } from "@instantdb/react";

// `data.ref` returns a list, so `in` is the membership test — false, rather than
// an error, for a row with no owner at all.
const isOwner = "auth.id != null && auth.id in data.ref('owner.id')";

// `$files` only. `auth.id + '/'` throws when signed out, hence the guards below.
const isUnderOwnPath = "data.path.startsWith(auth.id + '/')";

const owned = {
  allow: {
    view: isOwner,
    create: isOwner,
    update: isOwner,
    delete: isOwner,
  },
};

const rules = {
  // Deny by default: unlisted namespaces, and the `$streams` machinery this app
  // doesn't use.
  $default: {
    allow: {
      $default: "false",
    },
  },
  // Nobody edits the schema from the browser; that is what `push schema` is for.
  attrs: {
    allow: {
      $default: "false",
    },
  },
  $users: {
    allow: {
      view: "auth.id == data.id",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  cards: owned,
  lines: owned,
  examples: owned,
  exampleLinks: owned,
  lightCards: owned,
  // An upload exists before any transaction can link it, so `create` goes by
  // path. The rest accept either test and need to: a fresh file has no owner
  // when the transaction that gives it one is checked, and the files predating
  // all this have paths from before the prefix existed. `update` covers linking
  // — both `$files.link({ owner })` and `cards.link({ image })` land here.
  $files: {
    bind: ["isMine", `auth.id != null && (${isOwner} || ${isUnderOwnPath})`],
    allow: {
      view: "isMine",
      create: `auth.id != null && ${isUnderOwnPath}`,
      update: "isMine",
      delete: "isMine",
    },
  },
} satisfies InstantRules;

export default rules;
