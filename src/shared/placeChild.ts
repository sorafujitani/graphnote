import { estimateNoteHeight } from "./estimateNoteHeight.js";

/** Horizontal step between parent and child (matches `layoutTree` default `dx`). */
export const LAYOUT_DX = 340;

/** Vertical gap between stacked siblings (matches `layoutTree` default `gap`). */
export const LAYOUT_GAP = 32;

export type LayoutNodeLike = {
  x: number;
  y: number;
  title: string;
  body: string;
};

/** Position for a new child — same rules as incremental `layoutTree` placement. */
export function placeChildPosition(
  parent: LayoutNodeLike,
  existingSiblings: LayoutNodeLike[],
): { x: number; y: number } {
  const x = parent.x + LAYOUT_DX;
  if (existingSiblings.length === 0) {
    return { x, y: parent.y };
  }

  let bottom = parent.y;
  for (const sibling of existingSiblings) {
    bottom = Math.max(bottom, sibling.y + estimateNoteHeight(sibling.title, sibling.body));
  }
  return { x, y: bottom + LAYOUT_GAP };
}
