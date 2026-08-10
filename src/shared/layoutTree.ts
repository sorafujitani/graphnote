import { LAYOUT_DX, LAYOUT_GAP } from "./placeChild.js";

export type LayoutGraphNode = {
  id: string;
  width?: number | null;
  height?: number;
  /** Current vertical placement; decides sibling order so a moved card keeps its slot. */
  y?: number | null;
};
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
  const dy = options.dy ?? 120;
  const gap = options.gap ?? LAYOUT_GAP;

  const ids = new Set(nodes.map((node) => node.id));
  const widths = new Map(nodes.map((node) => [node.id, node.width ?? 280]));
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

  // Column widths per depth: one wide card only widens its own column,
  // not the whole grid. Iterative BFS with an index pointer — 25k-node
  // graphs must not pay O(n²) shift() or recursion depth here.
  const depthOf = new Map<string, number>();
  {
    const queue: Array<{ id: string; depth: number }> = roots.map((id) => ({ id, depth: 0 }));
    for (let head = 0; head < queue.length; head++) {
      const { id, depth } = queue[head] as { id: string; depth: number };
      if (depthOf.has(id)) continue;
      depthOf.set(id, depth);
      for (const kid of children.get(id) ?? []) queue.push({ id: kid, depth: depth + 1 });
    }
  }
  const columnWidest = new Map<number, number>();
  let maxDepth = 0;
  for (const [id, depth] of depthOf) {
    maxDepth = Math.max(maxDepth, depth);
    columnWidest.set(depth, Math.max(columnWidest.get(depth) ?? 280, widths.get(id) ?? 280));
  }
  const columnX: number[] = [x0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const step = options.dx ?? Math.max(LAYOUT_DX, (columnWidest.get(depth - 1) ?? 280) + 60);
    columnX.push((columnX[depth - 1] as number) + step);
  }
  const xForDepth = (depth: number): number => columnX[depth] ?? x0;

  // Where the user last left a card decides its slot; creation order only breaks ties.
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const centers = new Map(
    nodes
      .filter((node) => typeof node.y === "number")
      .map((node) => [node.id, (node.y as number) + (heights.get(node.id) ?? dy) / 2]),
  );
  // Missing centers sort last with one shared key so the comparator stays a
  // total order (mixing "compare by center" and "compare by index" per pair
  // is not transitive and gives engine-dependent results).
  const sortIds = (list: string[]) =>
    list.sort((a, b) => {
      const centerA = centers.get(a) ?? Number.POSITIVE_INFINITY;
      const centerB = centers.get(b) ?? Number.POSITIVE_INFINITY;
      if (centerA !== centerB) return centerA - centerB;
      return (order.get(a) ?? 0) - (order.get(b) ?? 0);
    });

  for (const id of ids) {
    const childIds = children.get(id);
    if (childIds) sortIds(childIds);
  }
  sortIds(roots);

  function heightOf(id: string): number {
    return heights.get(id) ?? dy;
  }

  function shiftPlaced(id: string, delta: number): void {
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      const pos = positions.get(current);
      if (pos) positions.set(current, { x: pos.x, y: pos.y + delta });
      for (const kid of children.get(current) ?? []) stack.push(kid);
    }
  }

  /** Returns y coordinate just below this subtree (exclusive of trailing gap). */
  function place(id: string, depth: number, top: number): number {
    const h = heightOf(id);
    const kids = children.get(id) ?? [];

    if (kids.length === 0) {
      positions.set(id, { x: xForDepth(depth), y: top });
      return top + h;
    }

    let childTop = top;
    const childCenters: number[] = [];
    for (const kid of kids) {
      childTop = place(kid, depth + 1, childTop) + gap;
    }
    let blockBottom = childTop - gap;

    for (const kid of kids) {
      const kidPos = positions.get(kid);
      if (!kidPos) throw new Error(`missing layout position for child ${kid}`);
      childCenters.push(kidPos.y + heightOf(kid) / 2);
    }

    const midCenter = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
    let parentTop = midCenter - h / 2;
    // A parent taller than its child block would poke above `top` and overlap
    // the previous subtree; push this whole subtree down instead.
    if (parentTop < top) {
      const delta = top - parentTop;
      for (const kid of kids) shiftPlaced(kid, delta);
      parentTop = top;
      blockBottom += delta;
    }
    positions.set(id, { x: xForDepth(depth), y: parentTop });

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
