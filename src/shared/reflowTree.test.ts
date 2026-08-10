import { describe, expect, it } from "vite-plus/test";
import { reflowAroundNode } from "./reflowTree";

describe("reflowAroundNode", () => {
  const edges = [
    { source_id: "p", target_id: "a" },
    { source_id: "p", target_id: "b" },
    { source_id: "p", target_id: "c" },
  ];

  it("pushes the siblings below a grown card down", () => {
    const moved = reflowAroundNode(
      [
        { id: "p", y: 0, height: 100 },
        { id: "a", y: 0, height: 300 },
        { id: "b", y: 100, height: 100 },
        { id: "c", y: 232, height: 100 },
      ],
      edges,
      "a",
      32,
    );

    expect(moved.get("a")).toBeUndefined();
    expect(moved.get("b")).toBe(332);
    expect(moved.get("c")).toBe(464);
  });

  it("pushes the siblings above a card that grew upwards", () => {
    const moved = reflowAroundNode(
      [
        { id: "p", y: 0, height: 100 },
        { id: "a", y: 0, height: 100 },
        { id: "b", y: -60, height: 260 },
        { id: "c", y: 232, height: 100 },
      ],
      edges,
      "b",
      32,
    );

    expect(moved.get("a")).toBe(-192);
    expect(moved.get("c")).toBeUndefined();
  });

  it("moves a pushed sibling together with its own children", () => {
    const moved = reflowAroundNode(
      [
        { id: "p", y: 0, height: 100 },
        { id: "a", y: 0, height: 300 },
        { id: "b", y: 100, height: 100 },
        { id: "b1", y: 100, height: 100 },
      ],
      [
        { source_id: "p", target_id: "a" },
        { source_id: "p", target_id: "b" },
        { source_id: "b", target_id: "b1" },
      ],
      "a",
      32,
    );

    expect(moved.get("b")).toBe(332);
    expect(moved.get("b1")).toBe(332);
  });

  it("cascades to the next branch of the tree", () => {
    const moved = reflowAroundNode(
      [
        { id: "r1", y: 0, height: 100 },
        { id: "a", y: 0, height: 400 },
        { id: "r2", y: 200, height: 100 },
      ],
      [{ source_id: "r1", target_id: "a" }],
      "a",
      32,
    );

    expect(moved.get("r2")).toBe(432);
  });

  it("leaves a graph alone when nothing overlaps", () => {
    const moved = reflowAroundNode(
      [
        { id: "p", y: 0, height: 100 },
        { id: "a", y: 0, height: 100 },
        { id: "b", y: 400, height: 100 },
      ],
      edges,
      "a",
      32,
    );

    expect(moved.size).toBe(0);
  });
});
