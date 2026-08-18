import { describe, it, expect } from "vitest";
import {
  DEPTH_BUTTONS,
  depthButtons,
  linePositions,
  type QueuedCard,
} from "./queue";

// The depth scale runs deeper than most lines are long, and every button past
// the bottom of the line does the same thing (drop to the bottom). These pin
// down where the offered range stops.

describe("depthButtons", () => {
  it("offers one button past the end of the line", () => {
    expect(depthButtons(560)).toEqual([8, 20, 50, 100, 250, 500, 750]);
  });

  it("counts a button that lands exactly on the bottom as the last one", () => {
    expect(depthButtons(500)).toEqual([8, 20, 50, 100, 250, 500]);
  });

  it("offers everything when the line is deeper than the scale", () => {
    expect(depthButtons(9000)).toEqual(DEPTH_BUTTONS);
  });

  it("keeps the shallowest button for a line shorter than it", () => {
    expect(depthButtons(0)).toEqual([8]);
    expect(depthButtons(3)).toEqual([8]);
  });

  it("only ever grows as the line does", () => {
    let prev = 0;
    for (let size = 0; size <= 3000; size += 7) {
      const n = depthButtons(size).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(depthButtons(size)).toEqual(DEPTH_BUTTONS.slice(0, n));
      prev = n;
    }
  });
});

// Where a card stands in each line it is in — what the "#12" badges print.

describe("linePositions", () => {
  const lines = [
    { id: "L1", name: "default" },
    { id: "L2", name: "verbs" },
  ];
  const cards: QueuedCard[] = [
    { id: "a", queues: { L1: { rank: "a2" }, L2: { rank: "a0" } } },
    { id: "b", queues: { L1: { rank: "a0" } } },
    { id: "c", queues: { L2: { rank: "a1" } } },
    { id: "d" },
  ];

  it("numbers each line from the top, by rank and not by input order", () => {
    const at = linePositions(cards, lines);
    expect(at.get("b")).toEqual([
      { lineId: "L1", name: "default", position: 1, size: 2 },
    ]);
    expect(at.get("a")).toEqual([
      { lineId: "L1", name: "default", position: 2, size: 2 },
      { lineId: "L2", name: "verbs", position: 1, size: 2 },
    ]);
  });

  it("leaves out a card that is in no line at all", () => {
    expect(linePositions(cards, lines).has("d")).toBe(false);
  });

  it("has nothing to say without lines", () => {
    expect(linePositions(cards, []).size).toBe(0);
  });
});
