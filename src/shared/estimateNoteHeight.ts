import { NOTE_MIN_HEIGHT } from "./noteSize.js";

/**
 * Terminal-style column count: CJK and other East Asian wide characters take
 * two columns, everything else one. The UI is Japanese-first, so counting
 * characters instead of columns underestimates most bodies by almost half.
 */
function textColumns(text: string): number {
  let columns = 0;
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd);
    columns += wide ? 2 : 1;
  }
  return columns;
}

/** Approximate rendered card height (px) for layout — matches `.note-card` in the UI. */
export function estimateNoteHeight(
  title: string,
  body: string,
  width: number | null = null,
): number {
  const PADDING = 22;
  const TITLE_LINE = 22;
  const BODY_LINE = 19;
  const TITLE_BODY_GAP = 6;
  /** Must match the `.note-card` min-height in the UI CSS. */
  const MIN = NOTE_MIN_HEIGHT;
  /** Must match the `.note-card` max-height clamp in the UI CSS. */
  const MAX = 520;
  /**
   * The shell is 280px, so content is ~254px (padding 24 + borders 2).
   * Measured with the real Noto Sans JP webfont: 19 JP chars (38 columns)
   * per body line, 16 JP chars (32 columns) per title line.
   */
  const DEFAULT_WIDTH = 280;
  const CONTENT_WIDTH = 254;
  const cardWidth = Math.max(200, width ?? DEFAULT_WIDTH);
  // A manually widened card wraps less, so its layout height should not be
  // calculated as if it were still the default 280px card.
  const widthFactor = (cardWidth - (DEFAULT_WIDTH - CONTENT_WIDTH)) / CONTENT_WIDTH;
  const bodyColsPerLine = Math.max(1, Math.floor(38 * widthFactor));
  const titleColsPerLine = Math.max(1, Math.floor(32 * widthFactor));

  const titleLines = Math.max(1, Math.ceil(textColumns(title) / titleColsPerLine));

  const bodyText = body.trim();
  let bodyLines = 2;
  let markdownSpacing = 0;
  if (bodyText) {
    bodyLines = 0;
    for (const line of bodyText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        bodyLines += 1;
        continue;
      }
      const lineFactor = /^[-*#>]/.test(trimmed) ? 1.2 : 1;
      bodyLines += Math.max(1, Math.ceil(textColumns(trimmed) / bodyColsPerLine) * lineFactor);
      if (/^[-*#>]/.test(trimmed)) markdownSpacing += 2;
    }
    bodyLines = Math.max(bodyLines, 2);
  }

  const raw =
    PADDING + titleLines * TITLE_LINE + TITLE_BODY_GAP + bodyLines * BODY_LINE + markdownSpacing;
  return Math.min(MAX, Math.max(MIN, Math.round(raw)));
}
