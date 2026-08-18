import { estimateNoteHeight } from "./estimateNoteHeight.js";

/** Horizontal step between parent and child (matches `layoutTree` default `dx`). */
export const LAYOUT_DX = 340;

/** Vertical gap between stacked siblings (matches `layoutTree` default `gap`). */
export const LAYOUT_GAP = 32;

export type LayoutNodeLike = {
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  title: string;
  body: string;
};

/** Position for a new child — same rules as incremental `layoutTree` placement. */
export function placeChildPosition(
  parent: LayoutNodeLike,
  existingSiblings: LayoutNodeLike[],
): { x: number; y: number } {
  const x = parent.x + Math.max(LAYOUT_DX, (parent.width ?? 280) + 60);
  if (existingSiblings.length === 0) {
    return { x, y: parent.y };
  }

  let bottom = parent.y;
  for (const sibling of existingSiblings) {
    bottom = Math.max(
      bottom,
      sibling.y +
        (sibling.height ?? estimateNoteHeight(sibling.title, sibling.body, sibling.width ?? null)),
    );
  }
  return { x, y: bottom + LAYOUT_GAP };
}
