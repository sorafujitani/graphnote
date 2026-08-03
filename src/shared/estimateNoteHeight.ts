/** Approximate rendered card height (px) for layout — matches `.note-card` in the UI. */
export function estimateNoteHeight(title: string, body: string): number {
  const PADDING = 22;
  const TITLE_LINE = 22;
  const BODY_LINE = 19;
  const TITLE_BODY_GAP = 6;
  const MIN = 96;
  const MAX = 520;
  /** ~280px card width at UI font sizes; conservative for mixed JP/Latin. */
  const CHARS_PER_LINE = 30;

  const titleLines = Math.max(1, Math.ceil(title.length / CHARS_PER_LINE));

  const bodyText = body.trim();
  let bodyLines = 2;
  if (bodyText) {
    bodyLines = 0;
    for (const line of bodyText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        bodyLines += 1;
        continue;
      }
      const lineFactor = /^[-*#>]/.test(trimmed) ? 1.2 : 1;
      bodyLines += Math.max(1, Math.ceil(trimmed.length / CHARS_PER_LINE) * lineFactor);
    }
    bodyLines = Math.max(bodyLines, 2);
  }

  const raw = PADDING + titleLines * TITLE_LINE + TITLE_BODY_GAP + bodyLines * BODY_LINE;
  return Math.min(MAX, Math.max(MIN, Math.round(raw)));
}
