import { useState } from "react";
import { KnmQuiz } from "./KnmQuiz";
import { ReadingQuiz } from "./ReadingQuiz";
import { ListeningQuiz } from "./ListeningQuiz";

type TestType = "knm" | "reading" | "listening";

const LS_TYPE = "tests-type";

function loadType(): TestType {
  const v = localStorage.getItem(LS_TYPE);
  if (v === "reading" || v === "listening") return v;
  return "knm";
}

export function TestsApp() {
  const [type, setType] = useState<TestType>(loadType);

  function switchTo(t: TestType) {
    setType(t);
    localStorage.setItem(LS_TYPE, t);
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      <div
        style={{
          borderBottom: "1px solid #e0e0e0",
          marginBottom: 24,
          padding: "16px 16px 0",
          maxWidth: 680,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", gap: 4, paddingBottom: 0 }}>
          {(["knm", "reading", "listening"] as TestType[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTo(t)}
              style={{
                padding: "8px 20px",
                border: "none",
                borderBottom:
                  type === t ? "2px solid #2563eb" : "2px solid transparent",
                background: "none",
                color: type === t ? "#2563eb" : "#555",
                fontWeight: type === t ? 600 : 400,
                fontSize: 15,
                cursor: "pointer",
                fontFamily: "inherit",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {type === "knm" && <KnmQuiz />}
      {type === "reading" && <ReadingQuiz />}
      {type === "listening" && <ListeningQuiz />}
    </div>
  );
}
