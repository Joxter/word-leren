# CLAUDE.md

Personal single-user Dutch-learning app. See `README.md` for architecture, features,
and the data model — this file only covers build/config gotchas that aren't obvious.

## Commands

- `npm run dev` — dev server
- `npm run build` — `tsc -b && vite build`
- `npm run format` — Prettier (there is no linter)
- `npm run build-dictionary` — regenerate `public/data/dictionary.json` + audio from `sources/`
- `node scripts/fetch-kaikki.mjs` — refresh `sources/kaikki-nl.jsonl` from Wiktionary (rarely; needs network)
- `npx instant-cli@latest push schema` — after editing `src/instant.schema.ts` or `src/instant.perms.ts`

## Gotchas

- **No linter, no tests.** TypeScript strict is on, but `noUnusedLocals/Parameters` are off.
- **Prettier config:** printWidth 80, trailing commas, `arrowParens: always`, **double quotes**.
- **Linaria CSS-in-JS:** `css` from `@linaria/core`, `styled` from `@linaria/react`; CSS is
  statically extracted at build. In `vite.config`, the wyw plugin must come **before** the react plugin.
- **`tsconfig.node.json`** needs `"composite": true` (not `"noEmit": true`) for project references.
- **InstantDB** is the backend (real-time data + file storage); app ID comes from `VITE_INSTANT_APP_ID`.

## Dictionary sources

`sources/kaikki-nl.jsonl` is a slimmed Wiktionary extract (the full one is 236 MB;
`scripts/fetch-kaikki.mjs` cuts it to the headwords the dictionary has). It **replaces**
`verb` — it has full conjugation tables — but only **fills in** `article`, because its
gender tags are noisier than the hand-made decks (it calls "het casino" a de-word).
Wiktionary is case-sensitive where `lemmaKey` is not, so `buildKaikki` prefers the
spelling the dictionary already uses — otherwise `Chili` inherits `chili` the pepper.

## Examples

`examples` are sentences shared by many cards. The attachment carries data (which
fragments of the sentence belong to that card), and **InstantDB links can't carry
attributes** — hence the `exampleLinks` join entity instead of a plain many-to-many.
Span offsets index into `examples.aText` and go stale on any edit, so every read runs
`anchorSpans` (in `src/lib/examples.ts`) to re-attach them by their stored `text`.

## Learning "line"

One global ordered queue, no timers/sessions. Ranks use `fractional-indexing`; all queue
mutations live in `src/lib/queue.ts`. New cards prepend to the top. Every action is logged
to a `cardEvents` history. Pages: `src/pages/Learn.tsx`, `src/pages/Line.tsx`.
