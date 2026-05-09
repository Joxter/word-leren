import { useState } from "react";
import type { ReadingItem } from "../data/types";
import rawData from "../data/reading.json";

const data = rawData as ReadingItem[];
const TOTAL = data.length;

const LS_PAGE = "reading-page";
const LS_HISTORY = "reading-history";

type History = Record<string, string>; // "${id}:${qIndex}" → chosen answer

function loadHistory(): History {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) ?? "{}");
  } catch {
    return {};
  }
}

function loadPage(): number {
  const n = parseInt(localStorage.getItem(LS_PAGE) ?? "0", 10);
  return isNaN(n) ? 0 : Math.min(n, TOTAL - 1);
}

const btn = (active: boolean): React.CSSProperties => ({
  padding: "10px 24px",
  background: active ? "#2563eb" : "#a0b4e8",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 15,
  cursor: active ? "pointer" : "not-allowed",
  fontFamily: "inherit",
});

export function ReadingQuiz() {
  const [pageIndex, setPageIndex] = useState(loadPage);
  const [history, setHistory] = useState(loadHistory);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState(false);

  const item = data[pageIndex];
  const allAnswered = item.questions.every((_, i) => answers[i] !== undefined);

  function pick(qIndex: number, option: string) {
    if (revealed) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: option }));
  }

  function reveal() {
    setRevealed(true);
    const patch: History = {};
    item.questions.forEach((_, i) => {
      if (answers[i] !== undefined) patch[`${item.id}:${i}`] = answers[i];
    });
    const next = { ...history, ...patch };
    setHistory(next);
    localStorage.setItem(LS_HISTORY, JSON.stringify(next));
  }

  function goTo(i: number) {
    setPageIndex(i);
    localStorage.setItem(LS_PAGE, String(i));
    setAnswers({});
    setRevealed(false);
  }

  const answeredTotal = Object.keys(history).length;
  const correctTotal = Object.entries(history).filter(([key, chosen]) => {
    const [id, qi] = key.split(":");
    const it = data.find((d) => d.id === id);
    return it?.questions[Number(qi)]?.correctAnswer === chosen;
  }).length;

  return (
    <div
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "0 16px 40px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>{item.title}</h2>
        {answeredTotal > 0 && (
          <span style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap", marginLeft: 16 }}>
            {correctTotal}/{answeredTotal} correct overall
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "#777", marginBottom: 20 }}>
        {pageIndex + 1} / {TOTAL}
      </div>

      <div
        className="transcript"
        dangerouslySetInnerHTML={{ __html: item.transcript }}
      />

      {item.questions.map((q, i) => {
        const chosen = answers[i];
        return (
          <div
            key={i}
            style={{
              marginBottom: 20,
              padding: "16px 20px",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
            }}
          >
            <p style={{ margin: "0 0 12px", fontWeight: 500 }}>
              {i + 1}. {q.question}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {q.options.map((option) => {
                const isChosen = chosen === option;
                const isCorrect = option === q.correctAnswer;
                let color = "inherit";
                if (revealed) {
                  if (isCorrect) color = "#1a7f1a";
                  else if (isChosen) color = "#c0392b";
                }
                return (
                  <label
                    key={option}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      cursor: revealed ? "default" : "pointer",
                      color,
                    }}
                  >
                    <input
                      type="radio"
                      name={`${item.id}-${i}`}
                      value={option}
                      checked={isChosen}
                      onChange={() => pick(i, option)}
                      disabled={revealed}
                      style={{ marginTop: 3, flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: revealed && isCorrect ? 600 : 400 }}>
                      {option}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        {!revealed && (
          <button onClick={reveal} disabled={!allAnswered} style={btn(allAnswered)}>
            Check answers
          </button>
        )}
        {revealed && pageIndex < TOTAL - 1 && (
          <button onClick={() => goTo(pageIndex + 1)} style={btn(true)}>
            Next →
          </button>
        )}
        {revealed && pageIndex === TOTAL - 1 && (
          <p style={{ margin: 0, alignSelf: "center", fontWeight: 500 }}>All done! 🎉</p>
        )}
      </div>

      <div style={{ marginTop: 40, borderTop: "1px solid #e0e0e0", paddingTop: 16 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Jump to text:</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {data.map((it, i) => {
            const done = it.questions.every(
              (_, qi) => history[`${it.id}:${qi}`] !== undefined,
            );
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                style={{
                  width: 32,
                  height: 32,
                  border:
                    i === pageIndex ? "2px solid #2563eb" : "1px solid #ccc",
                  borderRadius: 4,
                  background: done ? "#d1fae5" : "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: i === pageIndex ? 600 : 400,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
