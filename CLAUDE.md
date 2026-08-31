# CLAUDE.md

Personal Dutch-learning app; multi-user since accounts landed, but not social.
See `README.md` for architecture, features, and the data model — this file only
covers build/config gotchas that aren't obvious.

## Commands

- `npm run dev` — dev server
- `npm run build` — `tsc -b && vite build`
- `npm run format` — Prettier (there is no linter)
- `npm test` — Vitest
- `npm run build-dictionary` — regenerate `public/data/dictionary.json` + audio from `sources/`
- `node scripts/fetch-kaikki.mjs` — refresh `sources/kaikki-nl.jsonl` from Wiktionary (rarely; needs network)
- `npx instant-cli@latest push schema` / `push perms` — after editing `src/instant.schema.ts`
  or `src/instant.perms.ts`. Push schema **before** perms: a rule that mentions a link the
  backend doesn't have yet locks everyone out of that namespace.
- `node scripts/migrate-owner.mjs <email>` — give ownerless rows an owner (one-off; see below)
- `npm run backup` — dump every table + every uploaded image to a local folder

## Gotchas

- **No linter.** TypeScript strict is on, but `noUnusedLocals/Parameters` are off.
  Tests (`npm test`) cover `src/lib/` only.
- **Prettier config:** printWidth 80, trailing commas, `arrowParens: always`, **double quotes**.
- **Linaria CSS-in-JS:** `css` from `@linaria/core`, `styled` from `@linaria/react`; CSS is
  statically extracted at build. In `vite.config`, the wyw plugin must come **before** the react plugin.
- **`tsconfig.node.json`** needs `"composite": true` (not `"noEmit": true`) for project references.
- **InstantDB** is the backend (real-time data + file storage); app ID comes from `VITE_INSTANT_APP_ID`.

## Accounts and ownership

Magic-code auth; `AuthGate` in `src/App.tsx` renders nothing until there is a user.
Every entity carries an `owner` link to `$users` and the perms allow only your own rows.

- New rows must be stamped: `.link({ owner: ownerId() })`, from `src/lib/session.ts`.
  Forgetting it writes a row **nobody** can read back, including its author.
- `ownerId()` is a module singleton, not a hook — `AuthGate` sets it during render so the
  plain mutation helpers in `lib/` can reach it without threading a param through every page.
- Queries pass `$: { where: mine() }`. The perms already hide other users' rows, but `limit`
  counts rows *before* the rules reject them, so an unfiltered `limit` silently under-fetches.
- `$files` can't use the owner link for `create` (an upload precedes any transaction), so
  uploads go to `ownedPath(...)` → `<userId>/…` and the create rule checks that prefix.
- Anything not listed in `instant.perms.ts` is denied by `$default` — a new entity needs a
  rule added there or it will look broken rather than error.

`scripts/migrate-owner.mjs` links pre-auth rows to one account. It is idempotent, so it also
works as a repair tool if a write path ever forgets the owner.

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

## Scheduling

Classic day-based spaced repetition on FSRS (`ts-fsrs`), in `src/lib/srs.ts`. A card's
scheduling state is the library's own `Card`, stored verbatim in `cards.srs` with dates
as unix ms — one JSON blob rather than a column each, because the shape is the library's
and the app loads every card into memory anyway. The queue is just `due <= now`.

- **No card enters study by itself.** Creating a card gives it a line rank but no `srs`,
  which puts it in the Deck page's pool. From there you either mark it known (rated
  `Easy` on sight, ~a week out, skipping the learning steps) or take it in to learn.
- **The fuzz seed is tied to the card id** (`GenSeedStrategyWithCardId`). With the
  default seed the randomness comes from card *state*, so a batch graded identically on
  one day gets an identical "random" interval and travels the deck as one clump —
  200 cards marked known all landed on day 8. Seeded per card they spread over 6-10.
- Learn runs a 30s ticker: learning-step cards fall due in minutes, and nothing else
  would re-render when they do.
- `scripts/reset-srs.mjs` wipes scheduling state without touching `queues` or `log`.

The **manual queue is dormant, not deleted**: ranks (`fractional-indexing`, mutations in
`src/lib/queue.ts`) and the whole `log` history survive untouched, so the old depth-button
scheduler is a revert away. Don't delete `queue.ts` while that's still true.

## MCP-сервер

`server/mcp.ts` — read-only MCP поверх колоды, чтобы Клод дотягивался до неё с
телефона. Запуск локально `npm run mcp`, деплой — `docs/deploy.md`.

- Чистые вьюхи (`brief`, `events`, `byDay`) лежат в `src/lib/deck.ts`, а не
  рядом с сервером: `src/lib` переживёт переезд с Instant, и тесты смотрят туда.
- Сервер импортирует `src/lib/*.ts` **напрямую**, без сборки — Node 24 стрипает
  типы. Отсюда два правила для всего, до чего он дотягивается: относительные
  импорты с явным расширением `.ts`, а импорт только ради типа — `import type`.
  Ни tsc, ни `vite build` этого не ловят, падает только запуск.
- Admin-токен ходит мимо permissions, поэтому каждый запрос сужается по
  `owner.id` руками — `mine()` из `lib/session.ts` тут не работает.
- Авторизация — секрет в пути. Потолок известный: кто знает URL, тот читает.

Pages: `src/pages/Learn.tsx` (study), `src/pages/Deck.tsx` (triage + add),
`src/pages/Cards.tsx` (create form + the active line's list).
