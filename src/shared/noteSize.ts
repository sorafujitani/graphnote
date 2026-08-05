export const NOTE_MIN_WIDTH = 200;
export const NOTE_MIN_HEIGHT = 100;
export const NOTE_MAX_WIDTH = 1200;
export const NOTE_MAX_HEIGHT = 900;

export function isValidNoteWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= NOTE_MIN_WIDTH &&
    value <= NOTE_MAX_WIDTH
  );
}

export function isValidNoteHeight(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= NOTE_MIN_HEIGHT &&
    value <= NOTE_MAX_HEIGHT
  );
}
