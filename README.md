# word-leren

A personal Dutch language learning tool. The name means "learning words" in Dutch.

Built for a single user — me.

## Features

### Vocabulary Cards

Bilingual flashcards for three language pairs: NL↔EN, NL↔RU, and EN↔RU. Cards support optional images (paste from clipboard or upload), and text fields accept Markdoc (markdown) syntax. Cards are filtered by language pair via tabs.

### Grammar

Rich-text notes for grammar rules and examples. Displays as a grid list with a detail view and a split edit/preview layout with live Markdoc rendering. A sidebar lets you navigate between grammar cards.

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

## Development

```bash
npm install
npm run dev
```

Schema changes:

```bash
npx instant-cli@latest push schema
```
