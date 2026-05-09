import { useState } from "react";
import type { KnmItem } from "../data/types";
import rawData from "../data/knm.json";

const data = rawData as KnmItem[];
const PAGE_SIZE = 5;
const TOTAL_PAGES = Math.ceil(data.length / PAGE_SIZE);

const LS_PAGE = "knm-page";
const LS_HISTORY = "knm-history";

type History = Record<string, string>; // id → chosen answer

function loadHistory(): History {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) ?? "{}");
  } catch {
    return {};
  }
}

function loadPage(): number {
  const n = parseInt(localStorage.getItem(LS_PAGE) ?? "0", 10);
  return isNaN(n) ? 0 : Math.min(n, TOTAL_PAGES - 1);
}

export function KnmQuiz() {
  const [pageIndex, setPageIndex] = useState(loadPage);
  const [history, setHistory] = useState(loadHistory);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);

  const items = data.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const allAnswered = items.every((item) => answers[item.id] !== undefined);

  function pick(id: string, option: string) {
    if (revealed) return;
    setAnswers((prev) => ({ ...prev, [id]: option }));
  }

  function reveal() {
    setRevealed(true);
    const next = { ...history, ...answers };
    setHistory(next);
    localStorage.setItem(LS_HISTORY, JSON.stringify(next));
  }

  function nextPage() {
    const next = pageIndex + 1;
    setPageIndex(next);
    localStorage.setItem(LS_PAGE, String(next));
    setAnswers({});
    setRevealed(false);
  }

  function goTo(i: number) {
    setPageIndex(i);
    localStorage.setItem(LS_PAGE, String(i));
    setAnswers({});
    setRevealed(false);
  }

  const answeredTotal = Object.keys(history).length;
  const correctTotal = Object.entries(history).filter(([id, chosen]) => {
    const item = data.find((d) => d.id === id);
    return item && chosen === item.correctAnswer;
  }).length;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 40px", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span />
        {answeredTotal > 0 && (
          <span style={{ fontSize: 13, color: "#555" }}>
            {correctTotal}/{answeredTotal} correct overall
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "#777", marginBottom: 24 }}>
        Page {pageIndex + 1} of {TOTAL_PAGES}
      </div>

      {items.map((item, i) => {
        const chosen = answers[item.id];
        return (
          <div
            key={item.id}
            style={{
              marginBottom: 28,
              padding: "16px 20px",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            <p style={{ margin: "0 0 12px", fontWeight: 500 }}>
              {pageIndex * PAGE_SIZE + i + 1}. {item.question}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {item.options.map((option) => {
                const isChosen = chosen === option;
                const isCorrect = option === item.correctAnswer;
                let color = "inherit";
                if (revealed) {
                  if (isCorrect) color = "#1a7f1a";
                  else if (isChosen) color = "#c0392b";
                }
                return (
                  <label
                    key={option}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: revealed ? "default" : "pointer", color }}
                  >
                    <input
                      type="radio"
                      name={item.id}
                      value={option}
                      checked={isChosen}
                      onChange={() => pick(item.id, option)}
                      disabled={revealed}
                      style={{ marginTop: 3, flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: revealed && isCorrect ? 600 : 400 }}>{option}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        {!revealed && (
          <button
            onClick={reveal}
            disabled={!allAnswered}
            style={{
              padding: "10px 24px",
              background: allAnswered ? "#2563eb" : "#a0b4e8",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 15,
              cursor: allAnswered ? "pointer" : "not-allowed",
            }}
          >
            Check answers
          </button>
        )}

        {revealed && pageIndex < TOTAL_PAGES - 1 && (
          <button
            onClick={nextPage}
            style={{
              padding: "10px 24px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Next page →
          </button>
        )}

        {revealed && pageIndex === TOTAL_PAGES - 1 && (
          <p style={{ margin: 0, alignSelf: "center", fontWeight: 500 }}>
            All done! 🎉
          </p>
        )}
      </div>

      <div style={{ marginTop: 40, borderTop: "1px solid #e0e0e0", paddingTop: 16 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Jump to page:</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Array.from({ length: TOTAL_PAGES }, (_, i) => {
            const pageItems = data.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE);
            const done = pageItems.every((item) => history[item.id] !== undefined);
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                style={{
                  width: 32,
                  height: 32,
                  border: i === pageIndex ? "2px solid #2563eb" : "1px solid #ccc",
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
