import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KnmQuiz } from "./KnmQuiz";

createRoot(document.getElementById("tests-root")!).render(
  <StrictMode>
    <KnmQuiz />
  </StrictMode>,
);
