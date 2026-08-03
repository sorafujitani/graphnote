export type LayoutGraphNode = { id: string };
export type LayoutGraphEdge = { source_id: string; target_id: string };

export type TreeLayoutOptions = {
  x0?: number;
  y0?: number;
  dx?: number;
  dy?: number;
};

/**
 * Left-to-right tidy tree layout.
 * Parents sit at the vertical center of their children so edges stay short.
 */
export function layoutTree(
  nodes: LayoutGraphNode[],
  edges: LayoutGraphEdge[],
  options: TreeLayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const x0 = options.x0 ?? 80;
  const y0 = options.y0 ?? 80;
  const dx = options.dx ?? 320;
  const dy = options.dy ?? 170;

  const ids = new Set(nodes.map((node) => node.id));
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
    children.get(edge.source_id)!.push(edge.target_id);
    incoming.set(edge.target_id, (incoming.get(edge.target_id) ?? 0) + 1);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const roots = [...ids].filter((id) => (incoming.get(id) ?? 0) === 0);

  // Stable order: original node list order among roots / siblings.
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const sortIds = (list: string[]) =>
    list.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  for (const id of ids) {
    sortIds(children.get(id)!);
  }
  sortIds(roots);

  function place(id: string, depth: number, top: number): number {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      positions.set(id, { x: x0 + depth * dx, y: top });
      return top + dy;
    }

    let cursor = top;
    const childYs: number[] = [];
    for (const kid of kids) {
      cursor = place(kid, depth + 1, cursor);
      childYs.push(positions.get(kid)!.y);
    }
    const mid = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    positions.set(id, { x: x0 + depth * dx, y: mid });
    return cursor;
  }

  let forestTop = y0;
  for (const root of roots) {
    forestTop = place(root, 0, forestTop) + dy * 0.25;
  }

  // Any node missed (cycles): park below.
  for (const id of ids) {
    if (!positions.has(id)) {
      positions.set(id, { x: x0, y: forestTop });
      forestTop += dy;
    }
  }

  return positions;
}
