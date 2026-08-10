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

  it("keeps columns clear of the widest saved card", () => {
    const nodes = [
      { id: "p", width: 520 },
      { id: "c", width: 280 },
    ];
    const edges = [{ source_id: "p", target_id: "c" }];

    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0 });

    expect(pos.get("c")!.x - pos.get("p")!.x).toBe(580);
  });

  it("keeps a moved card in the slot it was dragged to", () => {
    // Creation order is a, b, c; the user dragged c between a and b.
    const nodes = [
      { id: "p", y: 0, height: 100 },
      { id: "a", y: 0, height: 100 },
      { id: "b", y: 400, height: 100 },
      { id: "c", y: 200, height: 100 },
    ];
    const edges = [
      { source_id: "p", target_id: "a" },
      { source_id: "p", target_id: "b" },
      { source_id: "p", target_id: "c" },
    ];

    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0, gap: 20 });

    expect(pos.get("c")!.y).toBeGreaterThan(pos.get("a")!.y);
    expect(pos.get("c")!.y).toBeLessThan(pos.get("b")!.y);
  });
});

describe("layoutTree regression fixes", () => {
  it("does not let a tall parent overlap the previous root subtree", () => {
    const nodes = [
      { id: "r1", height: 100, y: 0 },
      { id: "r2", height: 500, y: 100 },
      { id: "c", height: 100, y: 100 },
    ];
    const edges = [{ source_id: "r2", target_id: "c" }];
    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0, gap: 32 });

    // r2 starts below r1's band, and nothing goes above y0.
    expect(pos.get("r2")!.y).toBeGreaterThanOrEqual(100 + 32);
    for (const { y } of pos.values()) {
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  it("widens only the column that holds the wide card", () => {
    const nodes = [
      { id: "p", width: 1200 },
      { id: "a", width: 200 },
      { id: "b", width: 200 },
    ];
    const edges = [
      { source_id: "p", target_id: "a" },
      { source_id: "a", target_id: "b" },
    ];
    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0, gap: 32 });

    expect(pos.get("a")!.x).toBe(1260);
    // a's column is narrow, so b steps by the default column width, not p's.
    expect(pos.get("b")!.x).toBe(1260 + 340);
  });

  it("sorts a node with a saved y ahead of nodes without one", () => {
    const nodes = [
      { id: "r" },
      { id: "a", y: 100, height: 100 },
      { id: "b" },
      { id: "c", y: 50, height: 100 },
    ];
    const edges = [
      { source_id: "r", target_id: "a" },
      { source_id: "r", target_id: "b" },
      { source_id: "r", target_id: "c" },
    ];
    const pos = layoutTree(nodes, edges, { x0: 0, y0: 0, dy: 100, gap: 20 });

    expect(pos.get("c")!.y).toBeLessThan(pos.get("a")!.y);
    expect(pos.get("a")!.y).toBeLessThan(pos.get("b")!.y);
  });
});
