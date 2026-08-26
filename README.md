# word-leren

A personal Dutch language learning tool. The name means "learning words" in Dutch.

Multi-user, but not social: anyone can sign in, and everyone gets their own
private set of cards, examples and lines. The only thing shared is the
dictionary, which is a static file rather than a table.

## Features

### Accounts

Sign-in is by magic code — you type an email, InstantDB mails a six-digit code,
and that becomes a long-lived session. There are no passwords anywhere in the
system, and nothing renders until a user is signed in (`src/components/AuthGate.tsx`).

Every row a user creates carries an `owner` link to `$users`, and the permission
rules in `src/instant.perms.ts` allow reading and writing only your own rows.
Because InstantDB enforces `view` rules on the server, an unfiltered query can
never leak someone else's data — but queries still pass `where: mine()` from
`src/lib/session.ts`, since `limit` is applied before the rules get to reject
anything and an unfiltered `limit` would otherwise come back short.

Uploaded images are the exception: a file exists before any transaction can link
it, so `$files` create permission goes by a `<userId>/…` path prefix instead.

### Personal cabinet

`/account` is the personal cabinet, reached from the user icon in the top-right
corner — the only account control in the nav bar, since signing out lives on the
page itself. It holds the signed-in address and a sign-out button, counts of
what you have (cards, examples, grammar notes, lines), and the
bookkeeping for [lines](#learning) — create, rename, delete, and pick the one
Learn and Line open on, each shown with how many cards it holds and how many of
those are still new. The 14-day study strip (reviews per day, unique and total,
across every line) lives here too. It is also where later settings will go. Line _contents_ stay on the
Line page; only the lines themselves are managed here.

### Vocabulary Cards

Bilingual flashcards for three language pairs: NL↔EN, NL↔RU, and EN↔RU. Cards support optional images (paste from clipboard or upload) and an optional side-A audio clip (a path under `public/`, e.g. a dictionary pronunciation); a play button appears wherever the side-A word is shown — the create/edit forms, the card list, the line, and during review. Text fields accept Markdoc (markdown) syntax. Cards are filtered by language pair via tabs. New cards are added to the top of the learning line.

### Search

Every box that looks something up — the dictionary, the card list, and the pickers that
attach a card or an example — ranks rather than merely filters, because only the first
handful of results are ever on screen. Two rules, in order: a hit in a more important
field beats a hit in a less important one (a card's own word, then its translation, then
its note), and within a field exact beats prefix beats substring. Ties go to the shorter
word, then alphabetically, so "lopen" comes up before "lopendeband". `src/lib/search.ts`
holds it; `searchDictionary` picks its own tiers on top of the same primitive so that an
exactly-matched verb form can outrank a translation.

### Examples

Example sentences live as their own entity rather than inside a card's note, so one
sentence can serve many cards. What makes an attachment useful is _where_ in the sentence
the card appears: an attachment records a list of **spans** into the sentence — several of
them for separable verbs, so "Ik **sta** elke dag om 7 uur **op**" attaches to _opstaan_
through two fragments while the same sentence can attach to _elke_ through `elke dag`.
That is what the **Examples** mode on the Learn page blanks out; cards remain the basis of
the learning line.

- **Examples** (`/examples`) — a wide two-column page. On the left, every sentence as a
  table of sentence and translation, with all the linked fragments highlighted; a "Needs
  work" filter (and an amber edge on the row) finds sentences attached to nothing, or
  attached with no fragments picked yet. On the right, an editor for whichever row is
  selected — translation, which cards claim which words, and a note. It has no Save button:
  the text fields are written after a short pause and every link change goes out at once.
- **Adding** — the search box doubles as the way in. Type a sentence and, when nothing
  matches it, the page offers it as a new example, exactly as it stands — only the writer
  knows where one example ends. It comes out bare — no translation, no cards — to be
  filled in from the editor afterwards.
- **From a card** — the card editor has an Examples section that lists the sentences
  attached to that card, creates new ones, and attaches existing ones. It writes
  immediately, independently of the card form's Save.
- **Attaching a word** — the attach box searches your cards first and the
  [dictionary](#dictionary) underneath: picking a dictionary entry makes the card for it
  (the same one "Add to cards" makes, top of the line) and attaches it in one go. Words you
  already have a card for are left out of the dictionary half — that card is in the matches
  above. Each attached card shows where it stands in the line ("#12"), can be sent back to
  the top of it, and opens in the full card editor from the row.
- **Picking fragments** — click the words the card covers; for a partial word or a phrase,
  select the text and press "Blank selection". The sentence is shown once, not once per
  card: clicks assign to the card selected in the list above it, other cards' fragments
  stay visible in a second colour, and hovering either a fragment or a card lights up the
  other end of the pairing.

Spans are stored as `{ start, end, text }`. Because offsets go stale the moment the
sentence is edited, the `text` copy is what really identifies a fragment: on every read the
spans are re-anchored, taking the occurrence nearest the old offset, and only a fragment
that no longer occurs at all is reported as broken. See `src/lib/examples.ts`.

### Learning

A deliberately simple, Anki-inspired review mode built around a single global queue — "the line". No timers, days, or sessions, just one dynamic ordered list.

- **Learn** (`/learn`) — see the top card's side B as the prompt, with a hint of the answer's language (e.g. `EN → NL`). Reveal shows side A — its word, audio, and note — then press a **Depth** button to drop the card to the N-th place from the top (`5 / 10 / 50 / 100 / 500 / 1000`). The next card surfaces immediately. `Space`/`Enter` reveals; number keys `1`–`6` pick a depth.
- **Line** (`/line`) — view the whole line in order and nudge any card up or down by a number of steps, send one back to the top, or open any card in the editor via its **Edit** button. A Sort select picks between three views of the same cards — queue order, least seen first, and newest first (the order the Cards page lists in) — while the leading number always stays the card's place in the queue, so a move means the same thing in any of them. Cards join a line when they are created, not from here; the lines themselves are created and deleted on the [personal cabinet](#personal-cabinet).

Two toggles change what the prompt asks for. **Reverse** shows side A and asks for its
meaning, the direction reading actually needs. **Examples** prompts with one of the card's
[example sentences](#examples) instead, with the fragments belonging to that card blanked
out, and its translation underneath — Hint spells the gaps out letter by letter in place,
Type checks the missing words, and Reveal fills them back in and names the card. A card
with no usable example falls back to the plain prompt. The two can be on together: a
sentence is always asked in its own direction, so **Reverse** then applies to exactly
those cards that fall back. Whichever example came up is recorded on the review, so a card carrying
several sentences cycles through them least-recently-seen first rather than drilling one.
Revealing any card also lists its other examples underneath.

Positions use fractional-index ranks, so reordering is a single write — no renumbering. Every action (a `place` from Learn or a `move` from Line) is logged to a history of card events.

### Grammar

Rich-text notes for grammar rules and examples. Displays as a grid list with a detail view and a split edit/preview layout with live Markdoc rendering. A sidebar lets you navigate between grammar cards.

### Dictionary

A searchable offline Dutch dictionary merged from six imported sources (an Anki frequency dictionary, three vocabulary/grammar decks, and a CSV). Each headword gathers everything available for that word into a single entry: the `de`/`het` article, part of speech, irregular verb forms, and a per-source list of translations, example sentences, and audio clips (native recordings plus TTS). It is built ahead of time into a static JSON file with extracted audio and served directly from the site — no backend, works offline. See [Dictionary data](#dictionary-data) for the build.

Each entry has an **Add to cards** button that creates an NL→EN flashcard from it: the Dutch headword on side A (with its pronunciation audio), the entry's translations on side B, any example sentences in the note. The new card lands at the top of the line.

### Quizzes

A separate quiz page (`/tests.html`) with three tabs:

- **KnM** — multiple choice questions, paginated, with score tracking
- **Reading** — reading comprehension passages with questions
- **Listening** — audio player with speed control (0.5×–1.5×), a toggleable transcript, and comprehension questions

Quiz progress is saved in `localStorage`.

## Stack

- React 18 + TypeScript + Vite
- [Linaria](https://github.com/callstack/linaria) for CSS-in-JS (static extraction)
- [InstantDB](https://www.instantdb.com/) for real-time data and file storage
- [Markdoc](https://markdoc.dev/) for rich text rendering
- [Wouter](https://github.com/molefrog/wouter) for routing
- [fractional-indexing](https://github.com/rocicorp/fractional-indexing) for ordering the learning line

## Development

```bash
npm install
npm run dev
```

Schema and permission changes:

```bash
npx instant-cli@latest push schema
npx instant-cli@latest push perms
```

### Dictionary data

The dictionary is generated offline from the source decks in `sources/` (Anki `.apkg` exports + one CSV):

```bash
npm run build-dictionary
```

This merges every source by normalized Dutch lemma and writes:

- `public/data/dictionary.json` — ~6,700 merged entries (minified, ~1.7 MB)
- `public/audio/dict/` — ~6,200 audio clips referenced by the entries

Word-level facts (`article`, `pos`, `verb`) are taken from the most reliable source; generic content (`translation`, `examples`, `audio`) is kept per source under `info[]` so the origin of each stays visible:

```ts
type DictEntry = {
  word: string;
  pos?: string;
  article?: "de" | "het";
  verb?: { past?: string; participle?: string; separable?: boolean };
  info: {
    source: string;
    translation: string;
    audio?: string;
    examples?: string;
  }[];
};
```

Sources (`source` values): `frequency` (A Frequency Dictionary of Dutch — definitions, examples, audio, POS), `common` (1000 Most Common Words — audio), `vocab` (A0–A2 Vocabulary), `csv` (Dutch with articles), plus `de/het` (article only) and the irregular-verbs deck (verb forms only). Re-run the command after changing anything in `sources/`.
