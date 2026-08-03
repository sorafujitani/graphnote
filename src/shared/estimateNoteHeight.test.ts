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
