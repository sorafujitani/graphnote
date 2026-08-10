import type { LayoutGraphEdge } from "./layoutTree.js";
import { LAYOUT_GAP } from "./placeChild.js";

export type ReflowNode = { id: string; y: number; height: number };

/**
 * Slide neighbours out of the way of one card that just changed size or place.
 *
 * The anchor keeps the position the user gave it; every other sibling subtree
 * moves the minimum distance needed to clear it, cascading up the ancestors so
 * a grown card pushes the whole branch instead of burying the next one.
 * Returns the new `y` of the nodes that actually moved.
 */
export function reflowAroundNode(
  nodes: ReflowNode[],
  edges: LayoutGraphEdge[],
  anchorId: string,
  gap: number = LAYOUT_GAP,
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

  let branch = anchorId;
  const walked = new Set<string>();
  while (!walked.has(branch)) {
    walked.add(branch);
    const parent = parentOf.get(branch);
    const siblings = [...(parent ? (children.get(parent) ?? []) : roots)];
    if (siblings.length > 1 && siblings.includes(branch)) {
      // Center, not top: stretching one card's top edge must not reorder the branch.
      siblings.sort((a, b) => topOf(a) + bottomOf(a) - (topOf(b) + bottomOf(b)));
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
