import { describe, expect, it } from "vite-plus/test";
import { LAYOUT_DX, placeChildPosition } from "./placeChild";

describe("placeChildPosition", () => {
  it("offsets child horizontally by LAYOUT_DX", () => {
    const parent = { x: 100, y: 200, title: "P", body: "" };
    const pos = placeChildPosition(parent, []);
    expect(pos.x).toBe(100 + LAYOUT_DX);
    expect(pos.y).toBe(200);
  });

  it("stacks siblings below prior sibling height", () => {
    const parent = { x: 0, y: 0, title: "P", body: "" };
    const first = {
      x: LAYOUT_DX,
      y: 0,
      title: "A",
      body: "- line one\n- line two\n- line three",
    };
    const pos = placeChildPosition(parent, [first]);
    expect(pos.y).toBeGreaterThan(first.y + 100);
  });
});
