import { StrictMode } from "react";
import "./tests.css";
import { createRoot } from "react-dom/client";
import { TestsApp } from "./TestsApp";

createRoot(document.getElementById("tests-root")!).render(
  <StrictMode>
    <TestsApp />
  </StrictMode>,
);
