import { LAYOUT_DX, LAYOUT_GAP } from "./placeChild.js";

export type LayoutGraphNode = { id: string; width?: number | null; height?: number };
export type LayoutGraphEdge = { source_id: string; target_id: string };

export type TreeLayoutOptions = {
  x0?: number;
  y0?: number;
  dx?: number;
  /** Default node height when a node has no `height`. */
  dy?: number;
  /** Vertical gap between siblings and subtrees. */
  gap?: number;
};

/**
 * Left-to-right tidy tree layout.
 * Parents sit at the vertical center of their children; spacing respects node height.
 */
export function layoutTree(
  nodes: LayoutGraphNode[],
  edges: LayoutGraphEdge[],
  options: TreeLayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const x0 = options.x0 ?? 80;
  const y0 = options.y0 ?? 80;
  const widestNode = Math.max(280, ...nodes.map((node) => node.width ?? 280));
  const dx = options.dx ?? Math.max(LAYOUT_DX, widestNode + 60);
  const dy = options.dy ?? 120;
  const gap = options.gap ?? LAYOUT_GAP;

  const ids = new Set(nodes.map((node) => node.id));
  const heights = new Map(nodes.map((node) => [node.id, node.height ?? dy]));
  const children = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const id of ids) {
    children.set(id, []);
    incoming.set(id, 0);
  }

  for (const edge of edges) {
    if (!ids.has(edge.source_id) || !ids.has(edge.target_id)) continue;
    if (edge.source_id === edge.target_id) continue;
    // First parent wins for layout (keeps a tree; extra edges still render).
    if ((incoming.get(edge.target_id) ?? 0) > 0) continue;
    const sourceChildren = children.get(edge.source_id);
    if (!sourceChildren) continue;
    sourceChildren.push(edge.target_id);
    incoming.set(edge.target_id, (incoming.get(edge.target_id) ?? 0) + 1);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const roots = [...ids].filter((id) => (incoming.get(id) ?? 0) === 0);

  // Stable order: original node list order among roots / siblings.
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const sortIds = (list: string[]) =>
    list.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  for (const id of ids) {
    const childIds = children.get(id);
    if (childIds) sortIds(childIds);
  }
  sortIds(roots);

  function heightOf(id: string): number {
    return heights.get(id) ?? dy;
  }

  /** Returns y coordinate just below this subtree (exclusive of trailing gap). */
  function place(id: string, depth: number, top: number): number {
    const h = heightOf(id);
    const kids = children.get(id) ?? [];

    if (kids.length === 0) {
      positions.set(id, { x: x0 + depth * dx, y: top });
      return top + h;
    }

    let childTop = top;
    const childCenters: number[] = [];
    for (const kid of kids) {
      childTop = place(kid, depth + 1, childTop) + gap;
    }
    const blockBottom = childTop - gap;

    for (const kid of kids) {
      const kidPos = positions.get(kid);
      if (!kidPos) throw new Error(`missing layout position for child ${kid}`);
      childCenters.push(kidPos.y + heightOf(kid) / 2);
    }

    const midCenter = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
    const parentTop = midCenter - h / 2;
    positions.set(id, { x: x0 + depth * dx, y: parentTop });

    return Math.max(blockBottom, parentTop + h);
  }

  let forestTop = y0;
  for (const root of roots) {
    forestTop = place(root, 0, forestTop) + gap;
  }

  // Any node missed (cycles): park below.
  for (const id of ids) {
    if (!positions.has(id)) {
      positions.set(id, { x: x0, y: forestTop });
      forestTop += heightOf(id) + gap;
    }
  }

  return positions;
}
