import { useEffect, useState } from "react";
import { css } from "@linaria/core";
import { Link } from "wouter";
import { db } from "../db";
import { dailyReviewStats } from "../lib/queue";
import type { CardLog } from "../lib/queue";
import {
  dueCards,
  dueSoon,
  nextDueAt,
  newPool,
  rateCard,
  previewIntervals,
  formatGap,
  gradeHistory,
  GRADE_COLORS,
  RATINGS,
  type DueOrder,
  type SrsState,
} from "../lib/srs";
import { showCounter } from "../lib/prefs";
import { diffTyped } from "../lib/diff";
import { saveCard, deleteCard } from "../lib/cards";
import { useLines, useActiveLine } from "../lib/lines";
import { myCards } from "../lib/session";
import LineSelector from "../components/LineSelector";
import CardModal from "../components/CardModal";
import MarkdocContent from "../components/MarkdocContent";
import PlayButton, { playAudio } from "../components/PlayButton";
import HintLetters from "../components/HintLetters";
import VirtualKeyboard from "../components/VirtualKeyboard";
import ExampleText from "../components/ExampleText";
import {
  anchorSpans,
  pickClozeLink,
  spansAnswer,
  type ExampleLink,
} from "../lib/examples";
import type { Card, CardData } from "./Cards";

// On touch devices the "Type" mode uses our own on-screen keyboard and a fake
// input, so the phone's keyboard (with its autocomplete) never opens.
const COARSE_POINTER =
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

const page = css`
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.5rem;

  @media (max-width: 540px) {
    padding: 1rem 0.75rem;
  }
`;

const empty = css`
  text-align: center;
  color: #999;
  padding: 5rem 0;
  font-size: 0.9rem;
`;

const topBar = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const card = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 1.5rem 1.25rem;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  /* Full-bleed on phones: cancel the page padding, drop the side chrome. */
  @media (max-width: 540px) {
    margin: 0 -0.75rem;
    border-left: none;
    border-right: none;
    border-radius: 0;
    padding: 1rem 0.875rem;
  }
`;

const sideBlock = css`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const langTag = css`
  align-self: flex-start;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #666;
  background: #f0f0f0;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
`;

const langRow = css`
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

// Top strip of the card: language tags on the left, "Edit card" on the right.
const cardTop = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`;

// Target language of the (hidden) answer, shown as a hint on the prompt.
const langHint = css`
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #bbb;
`;

const front = css`
  font-size: 1.5rem;
  font-weight: 600;
`;

const frontRow = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

// The cloze prompt. Smaller than `front` because it is a whole sentence, and
// the same size in every state so revealing doesn't reflow it.
const clozeSentence = css`
  font-size: 1.25rem;
  line-height: 1.6;
`;

const clozeTranslation = css`
  font-size: 0.95rem;
  color: #777;
`;

// The card's own meaning, alongside its side A after a cloze is revealed.
const cardMeaning = css`
  font-size: 1rem;
  color: #777;
`;

const exampleList = css`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-top: 1px solid #eee;
  padding-top: 0.75rem;
`;

const exampleItem = css`
  font-size: 0.95rem;
  line-height: 1.5;
`;

const exampleTranslation = css`
  font-size: 0.85rem;
  color: #888;
`;

// The peeked example: context to recall the word by, before the answer.
const peekBox = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
`;

const peekBtn = css`
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: 0.8rem;
  color: #2563eb;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const divider = css`
  border: none;
  border-top: 1px solid #eee;
  margin: 0;
`;

const cardImg = css`
  max-width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 8px;
  align-self: flex-start;
`;

const actionRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;

  @media (max-width: 540px) {
    gap: 0.5rem;
  }
`;

const revealBtn = css`
  flex: 1;
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.85rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: #333;
  }
`;

const hintBtn = css`
  background: #fff;
  color: #1a1a1a;
  border: 1px solid #d5d5d5;
  padding: 0.85rem 1.25rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    border-color: #1a1a1a;
    background: #f7f7f7;
  }
`;

const answerInput = css`
  flex: 1;
  min-width: 0;
  border: 1px solid #d5d5d5;
  border-radius: 8px;
  padding: 0.85rem;
  /* Never below 16px, or iOS zooms the page in when the input is focused. */
  font-size: 1rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #1a1a1a;
  }

  /* On phones the input takes a full row of its own, above the buttons. */
  @media (max-width: 540px) {
    flex-basis: 100%;
    order: -1;
  }
`;

// Div styled like the real input; shows what the virtual keyboard has typed.
const fakeInput = css`
  flex: 1;
  min-width: 0;
  border: 1px solid #1a1a1a;
  border-radius: 8px;
  padding: 0.85rem;
  font-size: 1rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  @media (max-width: 540px) {
    flex-basis: 100%;
    order: -1;
  }
`;

const fakeCaret = css`
  display: inline-block;
  width: 2px;
  height: 1.05em;
  background: #1a1a1a;
  margin-left: 1px;
  vertical-align: text-bottom;
  animation: blink 1.1s step-end infinite;

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
`;

// The typed answer shown above the correct one after reveal.
const typedAnswer = css`
  font-size: 1.5rem;
  font-weight: 600;
  color: #2e7d32;
`;

const typedWrong = css`
  color: #c62828;
  text-decoration: underline;
`;

// A letter of the correct answer the user skipped, shown as a faded red gap.
const typedMissing = css`
  color: #c62828;
  opacity: 0.45;
`;

const depthRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
`;

const depthBtn = css`
  flex: 1 1 0;
  min-width: 64px;
  background: #fff;
  border: 1px solid #d5d5d5;
  border-radius: 8px;
  padding: 0.7rem 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a1a;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;

  &:hover {
    border-color: #1a1a1a;
    background: #f7f7f7;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// Training wheels under the rating buttons: what each grade means, so the
// choice comes from how the recall felt rather than from the day counts.
// Delete this block, `ratingGuide`, `guideKey` and `guideNote` once the four
// buttons are second nature.
const ratingGuide = css`
  margin-top: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.78rem;
  line-height: 1.35;
  color: #777;
`;

const guideKey = css`
  font-weight: 700;
  color: #444;
`;

// The same dot as the history strip, in front of the grade it explains — so
// a colour in the history is read off this list instead of guessed.
const guideDot = css`
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  margin-right: 0.35rem;
  vertical-align: middle;
`;

// The intervals, kept below the guide rather than on the buttons: they are the
// scheduler's opinion about this card, and having them under the thumb is what
// turned answering into picking a date. Outlives the training wheels above.
const intervalRow = css`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #ececec;
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.7rem;
  font-size: 0.72rem;
  color: #aaa;
`;

// The card's own answers, one dot each, oldest to newest. It replaced a
// "Seen N times" line plus the last few ratings as numbers: the same history
// reads faster as a shape — a run of green with one red in it is a card that
// lapsed once, and that is the thing you look for.
const historyRow = css`
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem;
`;

const historyDot = css`
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  /* The newest answer is the rightmost; a card with a long history wraps
     rather than shrinking the dots into invisibility. */
  flex: none;
`;

const intervalKey = css`
  font-weight: 600;
  color: #888;
`;

const guideNote = css`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #ececec;
  color: #999;
`;

const checkToggle = css`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #666;
  cursor: pointer;
  flex-shrink: 0;

  input {
    cursor: pointer;
  }
`;

const counter = css`
  display: inline-flex;
  gap: 0.3rem;
  color: #666;
  font-variant-numeric: tabular-nums;
`;

const countDone = css`
  color: #16a34a;
  font-weight: 600;
`;

// The "Examples" toggle, sized to match the line selector opposite.
const topBarToggles = css`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
`;

// The order picker, parked at the very bottom: it is set once and then
// forgotten, and it must not sit next to the rating buttons.
const sortRow = css`
  margin-top: 2rem;
  font-size: 0.8rem;
  color: #999;
  display: flex;
  align-items: center;
  gap: 0.4rem;

  select {
    font-family: inherit;
    font-size: 0.8rem;
    color: #666;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 0.2rem 0.3rem;
    background: #fff;
  }
`;

const invisible = css`
  visibility: hidden;
`;

const doneBox = css`
  background: #f0faf0;
  border: 1px solid #cde8cd;
  border-radius: 12px;
  padding: 2rem 1.25rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const doneTitle = css`
  font-size: 1.2rem;
  font-weight: 600;
  color: #2e7d32;
`;

const doneLine = css`
  font-size: 0.9rem;
  color: #555;
`;

const editBtn = css`
  background: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #333;
  cursor: pointer;

  &:hover {
    background: #e8e8e8;
    border-color: #1a1a1a;
  }
`;

interface LearnCard {
  id: string;
  aLang: string;
  bLang: string;
  aCard: string;
  bCard: string;
  note?: string;
  audio?: string;
  srs?: SrsState;
  image?: { id: string; url: string; path: string };
  queues?: { [lineId: string]: { rank: string } };
  log?: CardLog;
  exampleLinks?: ExampleLink[];
}

/**
 * The toggle that decides what the prompt asks for. `examples` shows one of the
 * card's example sentences with the card's own fragments blanked out; off, the
 * prompt is side B and the answer is side A — produce the Dutch word.
 *
 * There used to be a `reverse` toggle beside it (show side A, recall its
 * meaning). Recognising a word you are reading is the easy direction and the
 * deck was not getting anything out of asking it, so it is gone; the stored
 * flag is simply no longer read.
 */
const EXAMPLES_KEY = "word-leren:examples";
const ORDER_KEY = "word-leren:order";

const ORDERS: { value: DueOrder; label: string }[] = [
  { value: "due", label: "по расписанию" },
  { value: "hard", label: "сначала сложные" },
  { value: "easy", label: "сначала лёгкие" },
];
// Superseded by the two keys above, which used to be one three-way choice.
// Read once, so an existing preference survives the change.
const LEGACY_MODE_KEY = "word-leren:mode";

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function storedFlag(key: string, legacyMode: string): boolean {
  const stored = localStorage.getItem(key);
  if (stored !== null) return stored === "1";
  return localStorage.getItem(LEGACY_MODE_KEY) === legacyMode;
}

export default function Learn() {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintLetters, setHintLetters] = useState<boolean[]>([]);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  // Which of the card's examples is being peeked at, counted up rather than
  // wrapped so the button can just increment — see `peeked` below.
  const [peek, setPeek] = useState<number | null>(null);
  // A card in the learning steps comes back in minutes, not days. The queue is
  // computed against `Date.now()` at render, and no data changes when a card
  // simply falls due — without a ticker the page would sit on "all done" while
  // a card waited behind it.
  const [, tick] = useState(0);
  const [examplesOn, setExamplesOn] = useState(() =>
    storedFlag(EXAMPLES_KEY, "examples"),
  );
  const [order, setOrder] = useState<DueOrder>(
    () => (localStorage.getItem(ORDER_KEY) as DueOrder | null) ?? "due",
  );
  // Set on the Account page; read once per visit, which is when it can change.
  const [counterOn] = useState(showCounter);

  // Per-card scratch state: cleared whenever the prompt changes out from under
  // the user, whether that's a new card or a mode flip.
  function resetCardState() {
    setRevealed(false);
    setHintOpen(false);
    setHintLetters([]);
    setTyping(false);
    setTyped("");
    setPeek(null);
  }

  function toggleFlag(
    key: string,
    next: boolean,
    set: (v: boolean) => void,
  ): void {
    localStorage.setItem(key, next ? "1" : "0");
    set(next);
    // The card on screen would change mid-answer otherwise.
    resetCardState();
  }

  const { lines, isLoading: linesLoading } = useLines();
  const [activeLine, setActiveLine] = useActiveLine(lines);

  const { data, isLoading } = db.useQuery({
    cards: {
      image: {},
      exampleLinks: { example: {} },
      $: { where: myCards(), limit: 5000 },
    },
  });

  const cards = (data?.cards ?? []) as LearnCard[];
  const members = activeLine
    ? dueCards(cards, activeLine, Date.now(), order)
    : [];
  const current = members[0];
  // What the empty state needs to say something useful instead of "nothing".
  const laterToday = activeLine ? dueSoon(cards, activeLine) : 0;
  const nextAt = activeLine ? nextDueAt(cards, activeLine) : null;
  const untouched = activeLine ? newPool(cards, activeLine).length : 0;
  // Distinct cards answered today, across every line — the number the counter
  // is there to grow. Repeats of the same card in its learning steps would
  // inflate the total, so `unique` is the honest one.
  const doneToday = counterOn ? dailyReviewStats(cards, 1)[0].unique : 0;

  // The cloze this card is being asked as, or null for the plain prompt. Spans
  // are re-anchored against the sentence as it reads now, and a link whose
  // fragments have all gone missing falls back to the plain prompt rather than
  // showing a sentence with nothing blanked.
  const clozeLink =
    examplesOn && current
      ? pickClozeLink(current.exampleLinks ?? [], current.log)
      : undefined;
  const clozeSpans = clozeLink?.example
    ? anchorSpans(clozeLink.example.aText, clozeLink.spans ?? []).spans
    : [];
  const cloze =
    clozeLink?.example && clozeSpans.length > 0
      ? { link: clozeLink, example: clozeLink.example, spans: clozeSpans }
      : null;

  async function handleRate(rating: (typeof RATINGS)[number]["rating"]) {
    if (!current || !activeLine || busy) return;
    setBusy(true);
    const answer = typed.trim();
    // Read before the reset below, so the event records the example that was
    // actually on screen.
    const linkId = cloze?.link.id ?? "";
    // InstantDB applies the transaction to the local cache optimistically, so
    // `current` can already be the next card by the time this function
    // resumes after the await below. Flip these synchronously, before the
    // await, so that render never shows the next card as already revealed.
    resetCardState();
    try {
      await rateCard(current, activeLine, rating, answer, linkId);
    } finally {
      setBusy(false);
    }
  }

  /** Leave the answer box without answering: the typed text goes too, or the
   *  reveal would diff against a half-written word nobody stands behind. */
  function cancelTyping() {
    setTyping(false);
    setTyped("");
  }

  /** Open the example peek, or step to the next one. */
  function nextExample() {
    setPeek((prev) => (prev === null ? 0 : prev + 1));
  }

  async function handleUpdate(
    formData: CardData,
    imageFile: File | null,
    removeImageId: string | null,
  ): Promise<void> {
    await saveCard(modalCard!, formData, imageFile, removeImageId);
    setModalCard(null);
  }

  function handleDelete(cardId: string) {
    deleteCard(cardId);
    setModalCard(null);
    // The deleted card was the top one; surface the next card face-down.
    resetCardState();
  }

  // Keyboard: space/enter reveals, "h" opens the hint, "t" opens the answer
  // input; number keys pick a depth button once revealed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
      }
      if (!revealed) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          if (current) setRevealed(true);
        } else if (e.key === "h" || e.key === "H") {
          e.preventDefault();
          if (current) setHintOpen(true);
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          if (current) setTyping(true);
        } else if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          if (current) nextExample();
        }
        return;
      }
      const n = parseInt(e.key, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= RATINGS.length) {
        e.preventDefault();
        handleRate(RATINGS[n - 1].rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, current, busy, cloze?.link.id]);

  // Hint boxes and the typed answer are per-card scratch state — clear them
  // whenever the top card changes (depth placed, deleted, or swapped in).
  useEffect(() => {
    setHintOpen(false);
    setHintLetters([]);
    setTyping(false);
    setTyped("");
    setPeek(null);
  }, [current?.id]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Auto-play the answer's audio once the card is revealed.
  useEffect(() => {
    if (revealed && current?.audio) playAudio(current.audio);
  }, [revealed, current?.id]);

  if (isLoading || linesLoading) return <div className={page} />;

  if (lines.length === 0) {
    return (
      <div className={page}>
        <div className={empty}>
          No lines yet. Create one on the <Link href="/account">Account</Link>{" "}
          page.
        </div>
      </div>
    );
  }

  const selector = (
    <div className={topBar}>
      <div className={topBarToggles}>
        <label
          className={checkToggle}
          title="Prompt with an example sentence with this card's words blanked out, where there is one"
        >
          <input
            type="checkbox"
            checked={examplesOn}
            onChange={(e) =>
              toggleFlag(EXAMPLES_KEY, e.target.checked, setExamplesOn)
            }
          />
          Examples
        </label>
        {counterOn && (
          <span className={counter}>
            <span className={countDone} title="Cards studied today">
              ✓ {doneToday}
            </span>
            <span title="Cards still due">· {members.length}</span>
          </span>
        )}
      </div>
      <LineSelector lines={lines} value={activeLine} onChange={setActiveLine} />
    </div>
  );

  if (!current) {
    return (
      <div className={page}>
        {selector}
        <div className={doneBox}>
          <div className={doneTitle}>🎉 На сегодня всё</div>
          <div className={doneLine}>
            {/* The nearest card's time comes along in either case: "ещё
                вернётся" without it left the one question the screen exists to
                answer — стоит ли ждать — unanswered. */}
            {nextAt === null
              ? "В этой колоде пока нет ни одной карточки в изучении."
              : laterToday > 0
                ? `Ещё ${laterToday} ${plural(laterToday, "карточка вернётся", "карточки вернутся", "карточек вернётся")} сегодня, ближайшая через ${formatGap(nextAt - Date.now())}.`
                : `Следующая карточка — через ${formatGap(nextAt - Date.now())}.`}
          </div>
          {untouched > 0 && (
            <div className={doneLine}>
              Не в изучении: {untouched}.{" "}
              <Link href="/deck">Добавить из беклога</Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  const c = current;
  // What each button would schedule, so the choice is informed rather than blind.
  const intervals = previewIntervals(c);
  // How this card has gone so far, oldest answer first.
  const history = gradeHistory(c.log);

  // Which side is the prompt and which is the answer: side B asks, side A
  // answers. Audio belongs to side A, so it only ever plays on reveal.
  const promptText = c.bCard;
  const promptLang = c.bLang;
  // In a cloze the answer is the blanked fragments, joined the way they read in
  // the sentence — that is what Type checks and what the hint boxes spell out.
  const answerText = cloze ? spansAnswer(cloze.spans) : c.aCard;
  const answerLang = cloze ? cloze.example.aLang : c.aLang;

  // Everything else attached to this card, shown on reveal as extra context.
  // flatMap rather than filter so the example narrows to non-null.
  const otherExamples = (c.exampleLinks ?? []).flatMap((l) =>
    l.example && l.id !== cloze?.link.id
      ? [{ id: l.id, example: l.example, spans: l.spans ?? [] }]
      : [],
  );

  // The examples this card can be recalled through before the answer, offered
  // in turn. They need fragments that still anchor: with nothing blanked out
  // the sentence would spell the answer. A cloze prompt is already one of
  // these, so it offers none.
  const peekable = cloze
    ? []
    : (c.exampleLinks ?? []).flatMap((l) => {
        if (!l.example) return [];
        const spans = anchorSpans(l.example.aText, l.spans ?? []).spans;
        return spans.length > 0
          ? [{ id: l.id, example: l.example, spans }]
          : [];
      });
  const peeked =
    peek !== null && peekable.length > 0
      ? peekable[peek % peekable.length]
      : null;

  function revealHintLetter(idx: number) {
    setHintLetters((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  }

  return (
    <div className={page}>
      {selector}
      <div className={card}>
        <div className={sideBlock}>
          <div className={cardTop}>
            <div className={langRow}>
              <span className={langTag}>{cloze ? answerLang : promptLang}</span>
              <span className={langHint}>
                {cloze ? "fill the gaps" : `→ ${answerLang}`}
              </span>
            </div>
            {/* Always in the flow, so revealing doesn't grow this row and
                nudge the prompt down — just invisible until then. */}
            <button
              className={revealed ? editBtn : `${editBtn} ${invisible}`}
              onClick={() => setModalCard(current as Card)}
              tabIndex={revealed ? undefined : -1}
              aria-hidden={!revealed}
            >
              Edit card
            </button>
          </div>
          {cloze ? (
            <>
              {/* The sentence is the prompt, so the hint has to render in
                  place rather than below it: blanks become letter boxes and
                  the rest of the sentence stays readable throughout. */}
              <div className={clozeSentence}>
                {!revealed && hintOpen && !(typing && COARSE_POINTER) ? (
                  <HintLetters
                    inline
                    text={cloze.example.aText}
                    hidden={cloze.spans}
                    revealed={hintLetters}
                    onReveal={revealHintLetter}
                  />
                ) : (
                  <ExampleText
                    text={cloze.example.aText}
                    spans={cloze.spans}
                    mode={revealed ? "highlight" : "blank"}
                  />
                )}
              </div>
              {/* Part of the prompt, not a hint. It does name the missing
                  words fairly often, but without it a blanked sentence is
                  frequently ambiguous — the exercise is to produce the Dutch,
                  not to guess which meaning was intended. */}
              {cloze.example.bText?.trim() && (
                <div className={clozeTranslation}>{cloze.example.bText}</div>
              )}
            </>
          ) : (
            <div className={frontRow}>
              <div className={front}>{promptText}</div>
            </div>
          )}
        </div>

        {/* Context to place the word by, on demand — the card's own examples,
            one at a time. On reveal they are all listed below anyway. */}
        {!revealed && peekable.length > 0 && (
          <>
            <hr className={divider} />
            <div className={peekBox}>
              {peeked && (
                <div className={exampleItem}>
                  {/* The card's own words are the answer, so they stay blanked
                      and the translation — which would name them — stays off. */}
                  <ExampleText
                    text={peeked.example.aText}
                    spans={peeked.spans}
                    mode="blank"
                  />
                  {/* Kept, the way the cloze prompt keeps its own: the sentence
                      with its gaps is often ambiguous on its own, and the
                      exercise is to produce the Dutch, not to guess which
                      meaning was meant. */}
                  {peeked.example.bText?.trim() && (
                    <div className={exampleTranslation}>
                      {peeked.example.bText}
                    </div>
                  )}
                </div>
              )}
              {(peek === null || peekable.length > 1) && (
                <button className={peekBtn} onClick={nextExample}>
                  {peek === null
                    ? "Show example"
                    : `Another example (${(peek % peekable.length) + 1}/${peekable.length})`}
                </button>
              )}
            </div>
          </>
        )}

        {!cloze && !revealed && hintOpen && !(typing && COARSE_POINTER) && (
          <>
            <hr className={divider} />
            <HintLetters
              text={answerText}
              revealed={hintLetters}
              onReveal={revealHintLetter}
            />
          </>
        )}

        {revealed && (
          <>
            <hr className={divider} />
            {typed.trim() !== "" && (
              <div className={sideBlock}>
                <span className={langTag}>your answer</span>
                <div className={typedAnswer}>
                  {diffTyped(typed.trim(), answerText).map((d, i) => (
                    <span
                      key={i}
                      className={
                        d.kind === "wrong"
                          ? typedWrong
                          : d.kind === "missing"
                            ? typedMissing
                            : undefined
                      }
                    >
                      {d.ch}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* In a cloze the sentence above already spells the answer out in
                place, so this line names the card itself instead. */}
            <div className={frontRow}>
              <div className={front}>{cloze ? c.aCard : answerText}</div>
              {c.audio && <PlayButton path={c.audio} small />}
              {cloze && <span className={cardMeaning}>{c.bCard}</span>}
            </div>
            {cloze?.example.note?.trim() && (
              <MarkdocContent content={cloze.example.note} />
            )}
            {c.note?.trim() && <MarkdocContent content={c.note} />}
            {c.image?.url && (
              <img className={cardImg} src={c.image.url} alt="" />
            )}
            {otherExamples.length > 0 && (
              <div className={exampleList}>
                {otherExamples.map((l) => (
                  <div key={l.id} className={exampleItem}>
                    <ExampleText text={l.example.aText} spans={l.spans} />
                    {l.example.bText?.trim() && (
                      <div className={exampleTranslation}>
                        {l.example.bText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!revealed ? (
        <div className={actionRow}>
          {!hintOpen && (
            <button className={hintBtn} onClick={() => setHintOpen(true)}>
              Hint
            </button>
          )}
          {typing ? (
            <>
              {COARSE_POINTER ? (
                <div className={fakeInput}>
                  {typed}
                  <span className={fakeCaret} />
                </div>
              ) : (
                <input
                  className={answerInput}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setRevealed(true);
                    }
                    // The page-level handler ignores keys typed into an input,
                    // so Escape has to be caught here.
                    if (e.key === "Escape") cancelTyping();
                  }}
                  placeholder={
                    cloze
                      ? "Type the missing words…"
                      : `Type the ${answerLang} answer…`
                  }
                />
              )}
              {/* Typing is easy to start by accident (one keypress) and used to
                  be impossible to leave without answering — on a phone the
                  virtual keyboard took the screen with it. */}
              <button
                className={hintBtn}
                title="Отменить ввод"
                onClick={cancelTyping}
              >
                ✕
              </button>
            </>
          ) : (
            <button className={hintBtn} onClick={() => setTyping(true)}>
              Type
            </button>
          )}
          <button className={revealBtn} onClick={() => setRevealed(true)}>
            Reveal
          </button>
        </div>
      ) : null}

      {!revealed && typing && COARSE_POINTER && (
        <VirtualKeyboard
          onKey={(ch) => setTyped((prev) => prev + ch)}
          onBackspace={() => setTyped((prev) => prev.slice(0, -1))}
          // The hint here dims the keys the answer doesn't use, instead of the
          // letter slots. Diacritics fold to their base letter (ë → e).
          allowed={
            hintOpen
              ? new Set(
                  answerText
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, ""),
                )
              : null
          }
        />
      )}

      {revealed && (
        <>
          <div className={depthRow}>
            {RATINGS.map((r) => (
              <button
                key={r.rating}
                className={depthBtn}
                disabled={busy}
                onClick={() => handleRate(r.rating)}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Training wheels — see `ratingGuide`. */}
          <div className={ratingGuide}>
            {RATINGS.map((r) => (
              <div key={r.rating}>
                <span
                  className={guideDot}
                  style={{ background: GRADE_COLORS[r.rating] }}
                />
                <span className={guideKey}>{r.label}</span> — {r.hint}
              </div>
            ))}
            <div className={guideNote}>
              Отвечай по тому, как далось воспоминание. Сроки внизу — вывод
              алгоритма об этой карточке, и выбирая по ним, ты возвращаешь ему
              его же догадку. Числа через стрелку («10 мин → 1 дн») значат
              «короткий шаг сегодня, а после него — столько».
            </div>
          </div>
          <div className={intervalRow}>
            {RATINGS.map((r) => (
              <span key={r.rating}>
                <span className={intervalKey}>{r.label}</span>{" "}
                {intervals[r.rating]}
              </span>
            ))}
          </div>
          {history.length > 0 && (
            <div
              className={historyRow}
              title="Ответы по этой карточке: старые слева, свежие справа"
            >
              {history.map((h) => (
                <span
                  key={h.at}
                  className={historyDot}
                  style={{ background: GRADE_COLORS[h.rating] ?? "#ddd" }}
                  title={`${new Date(h.at).toLocaleDateString()} · ${RATINGS.find((r) => r.rating === h.rating)?.label ?? h.rating}${h.dueIn !== undefined ? ` · +${formatGap(h.dueIn * 864e5)}` : ""}`}
                />
              ))}
            </div>
          )}
        </>
      )}

      <label className={sortRow}>
        Порядок
        <select
          value={order}
          onChange={(e) => {
            const next = e.target.value as DueOrder;
            localStorage.setItem(ORDER_KEY, next);
            setOrder(next);
            // The top card changes under the user otherwise.
            resetCardState();
          }}
        >
          {ORDERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {modalCard !== null && (
        <CardModal
          card={modalCard}
          onSave={handleUpdate}
          onDelete={handleDelete}
          onClose={() => setModalCard(null)}
        />
      )}
    </div>
  );
}
