import { describe, expect, it } from "vite-plus/test";
import { layoutTree } from "./layoutTree";

describe("layoutTree", () => {
  it("centers a parent on its children and stacks siblings", () => {
    const nodes = [{ id: "r" }, { id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [
      { source_id: "r", target_id: "a" },
      { source_id: "r", target_id: "b" },
      { source_id: "a", target_id: "c" },
    ];
    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0, dx: 100, dy: 100, gap: 20 });

    expect(pos.get("r")!.x).toBe(0);
    expect(pos.get("a")!.x).toBe(100);
    expect(pos.get("b")!.x).toBe(100);
    expect(pos.get("c")!.x).toBe(200);

    expect(pos.get("c")!.y).toBe(pos.get("a")!.y);
    expect(pos.get("r")!.y).toBeCloseTo((pos.get("a")!.y + pos.get("b")!.y) / 2, 0);
    expect(pos.get("b")!.y).toBeGreaterThan(pos.get("a")!.y);
  });

  it("keeps separate roots in separate vertical bands", () => {
    const nodes = [{ id: "r1" }, { id: "r2" }, { id: "c1" }, { id: "c2" }];
    const edges = [
      { source_id: "r1", target_id: "c1" },
      { source_id: "r2", target_id: "c2" },
    ];
    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0, dx: 100, dy: 100, gap: 20 });
    expect(pos.get("r2")!.y).toBeGreaterThan(pos.get("r1")!.y);
    expect(Math.abs(pos.get("r1")!.y - pos.get("c1")!.y)).toBeLessThan(50);
    expect(Math.abs(pos.get("r2")!.y - pos.get("c2")!.y)).toBeLessThan(50);
  });

  it("spaces tall siblings without overlapping tops", () => {
    const nodes = [
      { id: "p", height: 100 },
      { id: "a", height: 280 },
      { id: "b", height: 200 },
    ];
    const edges = [
      { source_id: "p", target_id: "a" },
      { source_id: "p", target_id: "b" },
    ];
    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0, dx: 100, gap: 24 });
    const aBottom = pos.get("a")!.y + 280;
    expect(pos.get("b")!.y).toBeGreaterThanOrEqual(aBottom + 24 - 1);
  });
});
