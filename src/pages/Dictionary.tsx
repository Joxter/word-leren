import { useEffect, useMemo, useRef, useState } from "react";
import { css } from "@linaria/core";
import {
  loadDictionary,
  searchDictionary,
  entryAudios,
  type DictEntry,
} from "../lib/dictionary";

const page = css`
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const search = css`
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  outline: none;
  position: sticky;
  top: 1rem;
  background: #fff;

  &:focus {
    border-color: #1a1a1a;
  }
`;

const hint = css`
  text-align: center;
  color: #999;
  padding: 3rem 0;
  font-size: 0.875rem;
`;

const list = css`
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin-top: 1.25rem;
`;

const card = css`
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  padding: 0.875rem 1rem;
`;

const head = css`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const word = css`
  font-size: 1.125rem;
  font-weight: 600;
`;

const chip = css`
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
  line-height: 1.4;
`;

const chipDe = css`
  background: #e7f0fb;
  color: #1c5fb0;
`;

const chipHet = css`
  background: #eaf6ec;
  color: #2c7a3f;
`;

const pos = css`
  font-size: 0.8125rem;
  color: #999;
`;

const audioRow = css`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.6rem;
`;

const playBtn = css`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid #e5e5e5;
  background: #fafafa;
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: #555;
  cursor: pointer;

  &:hover {
    border-color: #aaa;
    color: #111;
  }
`;

const verbLine = css`
  font-size: 0.8125rem;
  color: #444;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: baseline;
`;

const verbTag = css`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #b06a1c;
  background: #fbf1e3;
  border-radius: 5px;
  padding: 0.05rem 0.35rem;
`;

// Each content group (translations / verb / examples) sits under a thin divider.
const section = css`
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
`;

const transRow = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.9375rem;
  color: #1a1a1a;

  & + & {
    margin-top: 0.3rem;
  }
`;

// Gray source label shown at the end of a translation / example row.
const srcEnd = css`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #bbb;
  white-space: nowrap;
  flex-shrink: 0;
`;

const verbLabel = css`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #999;
  margin-right: 0.25rem;
`;

const exampleRow = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;

  & + & {
    margin-top: 0.5rem;
  }
`;

const exampleText = css`
  font-size: 0.8125rem;
  color: #555;
  line-height: 1.45;

  p {
    margin: 0;
    white-space: pre-line;
  }

  p + p {
    color: #9a9a9a;
  }
`;

function play(audio: HTMLAudioElement | null, url: string) {
  if (!audio) return;
  audio.src = url;
  audio.play().catch(() => {});
}

function EntryCard({
  entry,
  audioEl,
}: {
  entry: DictEntry;
  audioEl: HTMLAudioElement | null;
}) {
  const audios = entryAudios(entry);
  const verb = entry.verb;

  // Translations grouped by content: identical ones (case-insensitive) merge
  // into one row that lists every source for them, in gray at the end.
  const transMap = new Map<string, { text: string; sources: string[] }>();
  for (const info of entry.info) {
    const text = info.translation?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const existing = transMap.get(key);
    if (existing) existing.sources.push(info.source);
    else transMap.set(key, { text, sources: [info.source] });
  }
  const translations = [...transMap.values()];

  const examplesList = entry.info
    .filter((i) => i.examples)
    .map((i) => ({ examples: i.examples as string, source: i.source }));

  return (
    <div className={card}>
      <div className={head}>
        <span className={word}>{entry.word}</span>
        {entry.article && (
          <span
            className={`${chip} ${entry.article === "het" ? chipHet : chipDe}`}
          >
            {entry.article}
          </span>
        )}
        {entry.pos && <span className={pos}>{entry.pos}</span>}
      </div>

      {translations.length > 0 && (
        <div className={section}>
          {translations.map((t, i) => (
            <div className={transRow} key={i}>
              <span>{t.text}</span>
              <span className={srcEnd}>{t.sources.join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      {verb && (verb.past || verb.participle || verb.separable) && (
        <div className={section}>
          <div className={verbLine}>
            {verb.separable && <span className={verbTag}>separable</span>}
            {verb.past && (
              <span>
                <span className={verbLabel}>past</span>
                {verb.past}
              </span>
            )}
            {verb.participle && (
              <span>
                <span className={verbLabel}>participle</span>
                {verb.participle}
              </span>
            )}
          </div>
        </div>
      )}

      {examplesList.length > 0 && (
        <div className={section}>
          {examplesList.map((ex, i) => (
            <div className={exampleRow} key={i}>
              <div className={exampleText}>
                {ex.examples.split("—").map((line, j) => (
                  <p key={j}>{line.trim()}</p>
                ))}
              </div>
              <span className={srcEnd}>{ex.source}</span>
            </div>
          ))}
        </div>
      )}

      {audios.length > 0 && (
        <div className={audioRow}>
          {audios.map((a) => (
            <button
              key={a.url}
              className={playBtn}
              onClick={() => play(audioEl, a.url)}
              title={`Play (${a.source})`}
            >
              ▶ {a.source}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dictionary() {
  const [entries, setEntries] = useState<DictEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    loadDictionary()
      .then(setEntries)
      .catch((e) => setError(String(e)));
  }, []);

  const results = useMemo(
    () => (entries ? searchDictionary(entries, query) : []),
    [entries, query],
  );

  const trimmed = query.trim();

  return (
    <div className={page}>
      <input
        className={search}
        placeholder="Search Dutch or English…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />

      {error && <div className={hint}>{error}</div>}
      {!entries && !error && <div className={hint}>Loading dictionary…</div>}
      {entries && trimmed === "" && (
        <div className={hint}>
          Type a word to search {entries.length.toLocaleString()} entries.
        </div>
      )}
      {entries && trimmed !== "" && results.length === 0 && (
        <div className={hint}>No matches for “{trimmed}”.</div>
      )}

      {results.length > 0 && (
        <div className={list}>
          {results.map((entry, i) => (
            <EntryCard
              key={`${entry.word}-${i}`}
              entry={entry}
              audioEl={audioRef.current}
            />
          ))}
        </div>
      )}
    </div>
  );
}
