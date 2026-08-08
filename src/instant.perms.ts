// Docs: https://www.instantdb.com/docs/permissions
//
// Every account is an island: you can only touch rows whose `owner` link points
// at you. `view` rules are enforced server-side and filter query results, so the
// pages don't have to say "where owner = me" — an unfiltered `db.useQuery` only
// ever comes back with your own rows.
//
// Everything not named here is denied by `$default`. Adding an entity to the
// schema therefore means adding it here too, or it will look broken.

import type { InstantRules } from "@instantdb/react";

// `data.ref` returns a list, so `in` is the membership test — it is false rather
// than an error when the row has no owner at all, which is what we want for a
// row that somehow escaped the migration.
const isOwner = "auth.id != null && auth.id in data.ref('owner.id')";

// For `$files` only: the folder an upload landed in. `auth.id + '/'` would blow
// up on a signed-out request, so every rule using this guards on `auth.id`
// first.
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
  // Storage is the one place the owner link can't carry the whole rule: an
  // upload creates the file before any transaction can link it, so `create` has
  // to go by the path instead — hence the `<userId>/…` prefix that
  // `lib/session.ts` builds.
  //
  // Everything else accepts either test, and needs to. A freshly uploaded file
  // has no owner yet, so the very transaction that gives it one is checked
  // against the path; the eight files that predate all this have paths from
  // before the prefix existed, so they can only be recognised by their owner.
  //
  // `update` covers linking, which is why it can't be "false": both
  // `$files.link({ owner })` and `cards.link({ image })` are updates to the
  // file.
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
