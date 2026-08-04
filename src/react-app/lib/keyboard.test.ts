import { describe, expect, it } from "vite-plus/test";
import { isEditableTarget, nearestNodeId } from "./keyboard";

describe("nearestNodeId", () => {
  const nodes = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 200, y: 0 },
    { id: "c", x: 0, y: 200 },
  ];

  it("picks the closest node to the right", () => {
    expect(nearestNodeId(nodes, "a", "right")).toBe("b");
  });

  it("picks the closest node below", () => {
    expect(nearestNodeId(nodes, "a", "down")).toBe("c");
  });

  it("ignores a mostly-right node when moving down", () => {
    const unevenNodes = [
      { id: "current", x: 0, y: 0 },
      { id: "mostly-right", x: 520, y: 40 },
      { id: "below", x: 0, y: 320 },
    ];

    expect(nearestNodeId(unevenNodes, "current", "down")).toBe("below");
  });

  it("stays put when every node is outside the requested direction sector", () => {
    const unevenNodes = [
      { id: "current", x: 0, y: 0 },
      { id: "mostly-right", x: 520, y: 40 },
    ];

    expect(nearestNodeId(unevenNodes, "current", "down")).toBeNull();
  });

  it("returns null when nothing is in that direction", () => {
    expect(nearestNodeId(nodes, "a", "left")).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("detects input elements", () => {
    const input = document.createElement("input");
    expect(isEditableTarget(input)).toBe(true);
  });

  it("rejects plain elements", () => {
    const div = document.createElement("div");
    expect(isEditableTarget(div)).toBe(false);
  });
});
