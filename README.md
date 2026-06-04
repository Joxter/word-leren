# word-leren

A personal Dutch language learning tool. The name means "learning words" in Dutch.

Built for a single user — me.

## Features

### Vocabulary Cards

Bilingual flashcards for three language pairs: NL↔EN, NL↔RU, and EN↔RU. Cards support optional images (paste from clipboard or upload), and text fields accept Markdoc (markdown) syntax. Cards are filtered by language pair via tabs. New cards are added to the top of the learning line.

### Learning

A deliberately simple, Anki-inspired review mode built around a single global queue — "the line". No timers, days, or sessions, just one dynamic ordered list.

- **Learn** (`/learn`) — see the top card, reveal the back side and note, then press a **Depth** button to drop the card to the N-th place from the top (`5 / 10 / 50 / 100 / 500 / 1000`). The next card surfaces immediately. `Space`/`Enter` reveals; number keys `1`–`6` pick a depth.
- **Line** (`/line`) — view the whole line in order and nudge any card up or down by a number of steps. A button backfills cards that aren't in the line yet.

Positions use fractional-index ranks, so reordering is a single write — no renumbering. Every action (a `place` from Learn or a `move` from Line) is logged to a history of card events.

### Grammar

Rich-text notes for grammar rules and examples. Displays as a grid list with a detail view and a split edit/preview layout with live Markdoc rendering. A sidebar lets you navigate between grammar cards.

### Dictionary

A searchable offline Dutch dictionary merged from six imported sources (an Anki frequency dictionary, three vocabulary/grammar decks, and a CSV). Each headword gathers everything available for that word into a single entry: the `de`/`het` article, part of speech, irregular verb forms, and a per-source list of translations, example sentences, and audio clips (native recordings plus TTS). It is built ahead of time into a static JSON file with extracted audio and served directly from the site — no backend, works offline. See [Dictionary data](#dictionary-data) for the build.

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

Schema changes:

```bash
npx instant-cli@latest push schema
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
  info: { source: string; translation: string; audio?: string; examples?: string }[];
};
```

Sources (`source` values): `frequency` (A Frequency Dictionary of Dutch — definitions, examples, audio, POS), `common` (1000 Most Common Words — audio), `vocab` (A0–A2 Vocabulary), `csv` (Dutch with articles), plus `de/het` (article only) and the irregular-verbs deck (verb forms only). Re-run the command after changing anything in `sources/`.
