import type { LayoutGraphEdge } from "./layoutTree.js";
import { LAYOUT_GAP } from "./placeChild.js";

export type ReflowNode = {
  id: string;
  y: number;
  height: number;
  x?: number;
  width?: number | null;
};

type Span = { left: number; right: number };

function spansOverlap(a: Span | null, b: Span | null): boolean {
  if (!a || !b) return true;
  return a.left < b.right && b.left < a.right;
}

/**
 * Slide neighbours out of the way of one card that just changed size or place.
 *
 * The anchor keeps the position the user gave it; every other sibling subtree
 * moves the minimum distance needed to clear it, cascading up the ancestors so
 * a grown card pushes the whole branch instead of burying the next one.
 * Returns the new `y` of the nodes that actually moved.
 *
 * `anchorBefore` is the anchor's geometry before the gesture; sibling order is
 * decided from it so growing a card cannot swap its slot with a neighbour.
 */
export function reflowAroundNode(
  nodes: ReflowNode[],
  edges: LayoutGraphEdge[],
  anchorId: string,
  gap: number = LAYOUT_GAP,
  anchorBefore?: { y: number; height: number },
): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(anchorId)) return new Map();

  const children = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (!byId.has(edge.source_id) || !byId.has(edge.target_id)) continue;
    if (edge.source_id === edge.target_id) continue;
    // First parent wins — same tree the layout uses.
    if (parentOf.has(edge.target_id)) continue;
    children.get(edge.source_id)?.push(edge.target_id);
    parentOf.set(edge.target_id, edge.source_id);
  }
  const roots = nodes.filter((node) => !parentOf.has(node.id)).map((node) => node.id);

  const shifts = new Map<string, number>();
  const subtrees = new Map<string, string[]>();
  function subtree(id: string): string[] {
    const cached = subtrees.get(id);
    if (cached) return cached;
    const out: string[] = [];
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      out.push(current);
      for (const kid of children.get(current) ?? []) stack.push(kid);
    }
    subtrees.set(id, out);
    return out;
  }
  const topOf = (id: string) =>
    Math.min(...subtree(id).map((kid) => (byId.get(kid) as ReflowNode).y + (shifts.get(kid) ?? 0)));
  const bottomOf = (id: string) =>
    Math.max(
      ...subtree(id).map((kid) => {
        const node = byId.get(kid) as ReflowNode;
        return node.y + (shifts.get(kid) ?? 0) + node.height;
      }),
    );
  const shiftSubtree = (id: string, delta: number) => {
    for (const kid of subtree(id)) shifts.set(kid, (shifts.get(kid) ?? 0) + delta);
  };

  // Sort key from pre-gesture geometry: a card stretched past its neighbour's
  // center must still be treated as sitting above it, or the neighbour gets
  // pushed the wrong way.
  const orderGeom = (id: string): { y: number; height: number } => {
    if (id === anchorId && anchorBefore) return anchorBefore;
    return byId.get(id) as ReflowNode;
  };
  const orderCenter = (id: string): number => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const kid of subtree(id)) {
      const geom = orderGeom(kid);
      min = Math.min(min, geom.y);
      max = Math.max(max, geom.y + geom.height);
    }
    return min + max;
  };

  // Horizontal span of a subtree; used to leave unrelated columns alone.
  const spanOf = (id: string): { left: number; right: number } | null => {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const kid of subtree(id)) {
      const node = byId.get(kid) as ReflowNode;
      if (node.x === undefined) return null;
      left = Math.min(left, node.x);
      right = Math.max(right, node.x + (node.width ?? 280));
    }
    return { left, right };
  };
  /**
   * Roots reachable from `branchId` through chains of horizontal overlap.
   * Pairwise overlap with the branch alone is not enough: pushing B down can
   * land it on C when B overlaps C but the branch does not.
   */
  const rootsTouching = (branchId: string): Set<string> => {
    const spans = new Map(roots.map((id) => [id, spanOf(id)] as const));
    const reached = new Set<string>([branchId]);
    const queue = [branchId];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const other of roots) {
        if (reached.has(other)) continue;
        if (spansOverlap(spans.get(current) ?? null, spans.get(other) ?? null)) {
          reached.add(other);
          queue.push(other);
        }
      }
    }
    return reached;
  };

  let branch = anchorId;
  const walked = new Set<string>();
  while (!walked.has(branch)) {
    walked.add(branch);
    const parent = parentOf.get(branch);
    // At the roots level every parentless node is a "sibling", including
    // unrelated islands elsewhere on the canvas — only push the ones whose
    // column is reachable from this branch through overlapping spans.
    let siblings: string[];
    if (parent) {
      siblings = [...(children.get(parent) ?? [])];
    } else {
      const touching = rootsTouching(branch);
      siblings = roots.filter((id) => touching.has(id));
    }
    if (siblings.length > 1 && siblings.includes(branch)) {
      // Center, not top: stretching one card's top edge must not reorder the branch.
      siblings.sort((a, b) => orderCenter(a) - orderCenter(b));
      const index = siblings.indexOf(branch);

      let previousBottom = bottomOf(branch);
      for (let i = index + 1; i < siblings.length; i += 1) {
        const sibling = siblings[i] as string;
        const overlap = previousBottom + gap - topOf(sibling);
        if (overlap > 0) shiftSubtree(sibling, overlap);
        previousBottom = bottomOf(sibling);
      }

      let nextTop = topOf(branch);
      for (let i = index - 1; i >= 0; i -= 1) {
        const sibling = siblings[i] as string;
        const overlap = bottomOf(sibling) + gap - nextTop;
        if (overlap > 0) shiftSubtree(sibling, -overlap);
        nextTop = topOf(sibling);
      }
    }
    if (!parent) break;
    branch = parent;
  }

  const moved = new Map<string, number>();
  for (const [id, delta] of shifts) {
    if (delta === 0 || id === anchorId) continue;
    moved.set(id, Math.round((byId.get(id) as ReflowNode).y + delta));
  }
  return moved;
}
