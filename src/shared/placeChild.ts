import { estimateNoteHeight } from "./estimateNoteHeight.js";

/** Horizontal step between parent and child (matches `layoutTree` default `dx`). */
export const LAYOUT_DX = 340;

/** Vertical gap between stacked siblings (matches `layoutTree` default `gap`). */
export const LAYOUT_GAP = 32;

const DEFAULT_NOTE_WIDTH = 280;

export type LayoutNodeLike = {
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  title: string;
  body: string;
};

/** Position for a new child without covering a note already in its target column. */
export function placeChildPosition(
  parent: LayoutNodeLike,
  occupiedNodes: LayoutNodeLike[],
): { x: number; y: number } {
  const x = parent.x + Math.max(LAYOUT_DX, (parent.width ?? DEFAULT_NOTE_WIDTH) + 60);
  const right = x + DEFAULT_NOTE_WIDTH;
  const blockers = occupiedNodes.filter((node) => {
    const nodeRight = node.x + (node.width ?? DEFAULT_NOTE_WIDTH);
    const nodeBottom =
      node.y + (node.height ?? estimateNoteHeight(node.title, node.body, node.width ?? null));
    return node.x < right && nodeRight > x && nodeBottom > parent.y;
  });
  if (blockers.length === 0) {
    return { x, y: parent.y };
  }

  let bottom = parent.y;
  for (const node of blockers) {
    bottom = Math.max(
      bottom,
      node.y + (node.height ?? estimateNoteHeight(node.title, node.body, node.width ?? null)),
    );
  }
  return { x, y: bottom + LAYOUT_GAP };
}
