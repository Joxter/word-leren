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
  counts rows _before_ the rules reject them, so an unfiltered `limit` silently under-fetches.
- `$files` can't use the owner link for `create` (an upload precedes any transaction), so
  uploads go to `ownedPath(...)` → `<userId>/…` and the create rule checks that prefix.
- Anything not listed in `instant.perms.ts` is denied by `$default` — a new entity needs a
  rule added there or it will look broken rather than error.

Card reads go through `myCards()` instead of `mine()` — same owner filter plus
`deletedAt: { $isNull: true }`, because deleting a card only stamps that field
(see below). A card query that reuses plain `mine()` shows deleted cards back.

`scripts/migrate-owner.mjs` links pre-auth rows to one account. It is idempotent, so it also
works as a repair tool if a write path ever forgets the owner.

## Dictionary sources

`sources/kaikki-nl.jsonl` is a slimmed Wiktionary extract (the full one is 236 MB;
`scripts/fetch-kaikki.mjs` cuts it to the headwords the dictionary has). It **replaces**
`verb` — it has full conjugation tables — but only **fills in** `article`, because its
gender tags are noisier than the hand-made decks (it calls "het casino" a de-word).
Wiktionary is case-sensitive where `lemmaKey` is not, so `buildKaikki` prefers the
spelling the dictionary already uses — otherwise `Chili` inherits `chili` the pepper.

## Deleting and editing cards

Deletion is soft: `deleteCard` stamps `cards.deletedAt` and logs a `delete`
event; nothing is removed. The card keeps its `srs`, its `log` and its ranks in
`queues`, so `restoreCard` is the whole way back — no screen calls it yet, it is
for the console. Nothing purges old rows either; if the deck ever needs it, a
script over `deletedAt` is the place.

- Reads filter with `myCards()`. Two exceptions: `CardExamples` fetches a card
  by id (it is the card open in the editor), and cards reached _through_ a
  nested link — `examples: { links: { card: {} } }` — can't be filtered in the
  query at all. Those go through `liveLinks` (lib/examples.ts) instead, which
  drops an attachment whose card is deleted. The write paths don't call it: a
  restored card should find its blanks where it left them.
- The perms **deny** `delete` on `cards`: a stray `.delete()` from the browser
  now fails instead of taking a card's history with it. A real purge runs from
  `scripts/` on the admin token, which goes around the rules.
- `saveCard` takes the **card**, not its id, so it can diff the text it used to
  hold and append an `edit` event (`editEntry` in `lib/cards.ts`). The event
  names the changed fields and keeps the old `aCard`/`bCard`; the old **note is
  not kept** — it holds a whole dictionary entry and every page loads every
  card's log, so copies per edit would grow the row for nothing.
- Log writes are `merge`, never `update`: `log` is one JSON blob and an update
  replaces the entire history with the single new event.

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

- **New cards go straight into study.** Creating a card (the Cards form, the dictionary's
  "+ Add to cards") calls `introduce`, so it gets FSRS state and is asked at the next
  session. The Backlog page (`Deck.tsx`) is only for the pool that predates that —
  cards with a line rank and no `srs` — and goes away once the pool is empty.
  Retired 2026-09-05: the "mark known" bulk triage (`markKnown`, rating `Easy` on sight
  ~a week out) — it existed to drain that pool and its `known` events are still in the log.
- **The fuzz seed is tied to the card id** (`GenSeedStrategyWithCardId`). With the
  default seed the randomness comes from card _state_, so a batch graded identically on
  one day gets an identical "random" interval and travels the deck as one clump —
  200 cards marked known all landed on day 8. Seeded per card they spread over 6-10.
- Learn runs a 30s ticker: learning-step cards fall due in minutes, and nothing else
  would re-render when they do.
- **The rating buttons print two numbers when one isn't comparable.** `Again` on a
  mature card only schedules a 10-minute relearning step, so next to `Good`'s "15 дн"
  it reads like the cheap option while actually wiping the card's stability. Any
  rating that lands in a learning step shows the step _and_ what follows it
  (`10 мин → 1 дн`) — that's `settle()` in `srs.ts`, walking the remaining steps on
  `Good`. Two buttons can still print the same day count: below ~1.5 days of
  stability every grade floors to one day, and the difference lives in S/D instead.
- `scripts/reset-srs.mjs` wipes scheduling state without touching `queues` or `log`.

The **manual queue is dormant, not deleted**: ranks (`fractional-indexing`, mutations in
`src/lib/queue.ts`) and the whole `log` history survive untouched, so the old depth-button
scheduler is a revert away. Don't delete `queue.ts` while that's still true.

## MCP-сервер

`server/mcp.ts` — MCP поверх колоды, чтобы Клод дотягивался до неё с телефона.
Читает всё, пишет двумя тулами: `edit_card` правит текст карточки (стороны и
`note`), `create_card` заводит новую.
Запуск локально `npm run mcp`, деплой — `docs/deploy.md`.

- Чистые вьюхи (`brief`, `events`, `byDay`) и обе текстовые функции
  (`trimCardText`, `editEvent`) лежат в `src/lib/deck.ts`, а не рядом с
  сервером: `src/lib` переживёт переезд с Instant, и тесты смотрят туда. Это
  **единственный** модуль в `lib/`, который серверу можно импортировать —
  остальные тянут `../db` и открывают сокет на импорте.
- `create_card` кладёт карточку в начало линии (по умолчанию — самая старая,
  как `getDefaultLineId` в приложении) и **сразу в оборот**: `freshSrs()` из
  `lib/deck.ts` — то же состояние, что пишет `introduce` в приложении, так что
  карточка спрашивается в ближайшей сессии. Отдельного события `introduce` нет,
  `create` говорит и то и другое. Ранг считается тут же, простым
  «в самый верх» — умный `topInsertRank` живёт в `lib/queue.ts`, а тот тянет
  `../db`. Дубли по стороне A отбиваются: чат не видит колоду и заводит слово
  повторно. Событие — `kind: "create"` (не `top`), и `isFresh` в `queue.ts`
  теперь считает его добавлением: ручная очередь спит, но путь назад цел.
- `edit_card` меняет только текст. Расписание, линии и примеры он не трогает:
  правка опечатки не должна двигать `due`. Событие пишется в тот же `cards.log`
  с `via: "mcp"` — иначе в истории не отличить правку из приложения от правки
  из чата.
- Сервер импортирует `src/lib/*.ts` **напрямую**, без сборки — Node 24 стрипает
  типы. Отсюда два правила для всего, до чего он дотягивается: относительные
  импорты с явным расширением `.ts`, а импорт только ради типа — `import type`.
  Ни tsc, ни `vite build` этого не ловят, падает только запуск.
- Admin-токен ходит мимо permissions, поэтому каждый запрос сужается по
  `owner.id` руками — `mine()` из `lib/session.ts` тут не работает.
- Admin SDK отдаёт **любую** вложенную связь массивом, включая `has: one`:
  `l.example` тут `[{…}]`, а в react-клиенте — объект. Читаешь как объект —
  молча получаешь `undefined`, не ошибку.
- `events()` выбрасывает `place`/`top`/`move` — события мёртвой ручной очереди.
  Строки в базе остаются (путь назад цел), но в историю их пускать нечего:
  их в 12 раз больше, чем настоящих ответов.
- Поиск в MCP ищет только по сторонам карточки, без `note`: заметка — это
  вставленная словарная статья, и короткое слово находилось в чужом примере.
- Авторизация — секрет в пути. Потолок вырос вместе с `edit_card`: кто знает
  URL, тот и правит карточки. Ротация — env на дроплете плюс коннектор.

Pages: `src/pages/Learn.tsx` (study), `src/pages/Deck.tsx` (Backlog: the pre-`introduce`
pool), `src/pages/Cards.tsx` (create form + the active line's list).
