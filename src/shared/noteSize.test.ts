import { describe, expect, it } from "vite-plus/test";
import {
  clampNoteHeight,
  clampNoteWidth,
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

  it("clamps a measured size into the range the API accepts", () => {
    expect(clampNoteWidth(NOTE_MIN_WIDTH - 1)).toBe(NOTE_MIN_WIDTH);
    expect(clampNoteWidth(NOTE_MAX_WIDTH + 1)).toBe(NOTE_MAX_WIDTH);
    expect(clampNoteHeight(NOTE_MIN_HEIGHT - 1)).toBe(NOTE_MIN_HEIGHT);
    expect(clampNoteHeight(NOTE_MAX_HEIGHT + 1)).toBe(NOTE_MAX_HEIGHT);
  });

  it("leaves a size already inside the range alone", () => {
    expect(clampNoteWidth(320)).toBe(320);
    expect(clampNoteHeight(320)).toBe(320);
  });

  it("rejects invalid or unbounded sizes", () => {
    expect(isValidNoteWidth(NOTE_MIN_WIDTH - 1)).toBe(false);
    expect(isValidNoteWidth(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidNoteHeight(NOTE_MAX_HEIGHT + 1)).toBe(false);
    expect(isValidNoteHeight("200")).toBe(false);
  });
});
