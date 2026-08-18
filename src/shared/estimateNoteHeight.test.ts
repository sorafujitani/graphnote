import { describe, expect, it } from "vite-plus/test";
import { estimateNoteHeight } from "./estimateNoteHeight";

describe("estimateNoteHeight", () => {
  it("grows with body lines", () => {
    const short = estimateNoteHeight("Title", "one line");
    const long = estimateNoteHeight(
      "Title",
      "- bullet one\n- bullet two\n- bullet three\n\nmore text",
    );
    expect(long).toBeGreaterThan(short);
  });
});

describe("estimateNoteHeight column counting", () => {
  it("counts CJK characters as two columns", () => {
    const jp = "い".repeat(150); // 300 columns -> 8 body lines
    const latin = "a".repeat(150); // 150 columns -> 4 body lines
    expect(estimateNoteHeight("t", jp)).toBeGreaterThan(estimateNoteHeight("t", latin));
  });

  it("clamps at the CSS max-height of 520", () => {
    expect(estimateNoteHeight("t", "x".repeat(20000))).toBe(520);
  });

  it("stays at the minimum for empty content", () => {
    expect(estimateNoteHeight("", "")).toBe(96);
  });

  it("uses a manually widened card's available width", () => {
    const body = "い".repeat(160);
    expect(estimateNoteHeight("t", body, 900)).toBeLessThan(estimateNoteHeight("t", body, 200));
  });
});
