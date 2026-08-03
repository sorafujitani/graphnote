import type { CascadeResult, EdgeRecord } from "../shared/types";

export function computeCascade(
  edges: EdgeRecord[],
  seedNodeIds: string[],
  mode: "outgoing" | "both" = "outgoing",
): CascadeResult {
  const seeds = new Set(seedNodeIds);
  const nodeIds = new Set(seedNodeIds);
  const edgeIds = new Set<string>();

  const outgoing = new Map<string, EdgeRecord[]>();
  const incoming = new Map<string, EdgeRecord[]>();
  for (const edge of edges) {
    const out = outgoing.get(edge.source_id) ?? [];
    out.push(edge);
    outgoing.set(edge.source_id, out);
    const inn = incoming.get(edge.target_id) ?? [];
    inn.push(edge);
    incoming.set(edge.target_id, inn);
  }

  const queue = [...seeds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextEdges = [
      ...(outgoing.get(current) ?? []),
      ...(mode === "both" ? (incoming.get(current) ?? []) : []),
    ];
    for (const edge of nextEdges) {
      edgeIds.add(edge.id);
      const neighbor = edge.source_id === current ? edge.target_id : edge.source_id;
      if (!nodeIds.has(neighbor)) {
        nodeIds.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)) {
      edgeIds.add(edge.id);
    }
  }

  return {
    nodeIds: [...nodeIds],
    edgeIds: [...edgeIds],
  };
}
