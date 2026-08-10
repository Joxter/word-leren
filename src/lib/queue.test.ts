import { describe, it, expect } from "vitest";
import { DEPTH_BUTTONS, depthButtons } from "./queue";

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
