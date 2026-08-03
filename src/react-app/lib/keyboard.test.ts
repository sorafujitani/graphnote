import { describe, expect, it } from "vitest";
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
