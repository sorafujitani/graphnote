import { describe, expect, it } from "vite-plus/test";
import {
  isValidNoteHeight,
  isValidNoteWidth,
  NOTE_MAX_HEIGHT,
  NOTE_MAX_WIDTH,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
} from "./noteSize";

describe("note size boundaries", () => {
  it("accepts sizes inside the editor limits", () => {
    expect(isValidNoteWidth(NOTE_MIN_WIDTH)).toBe(true);
    expect(isValidNoteWidth(NOTE_MAX_WIDTH)).toBe(true);
    expect(isValidNoteHeight(NOTE_MIN_HEIGHT)).toBe(true);
    expect(isValidNoteHeight(NOTE_MAX_HEIGHT)).toBe(true);
  });

  it("rejects invalid or unbounded sizes", () => {
    expect(isValidNoteWidth(NOTE_MIN_WIDTH - 1)).toBe(false);
    expect(isValidNoteWidth(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidNoteHeight(NOTE_MAX_HEIGHT + 1)).toBe(false);
    expect(isValidNoteHeight("200")).toBe(false);
  });
});
