import { MarkerType, type Edge } from "@xyflow/react";
import type { EdgeRecord, NodeRecord } from "../../shared/types";
import type { AppNode, EditRequest } from "./graphEditorTypes";

const EDGE_COLOR = "#64748b";
const EDGE_HOT_COLOR = "#60a5fa";

export const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 12,
  height: 12,
  color: EDGE_COLOR,
};

export function presentEdges(
  edges: EdgeRecord[],
  cascadeIds: Set<string>,
  selectedEdgeIds: Set<string>,
): Edge[] {
  return edges.map((edge) => {
    const hot = cascadeIds.has(edge.id) || selectedEdgeIds.has(edge.id);
    return {
      id: edge.id,
      source: edge.source_id,
      target: edge.target_id,
      label: edge.label || undefined,
      selected: selectedEdgeIds.has(edge.id),
      animated: false,
      // Bezier avoids smoothstep's shared vertical "rails" when siblings fan out.
      type: "default",
      // Plain edges inherit --xy-edge-stroke; only the highlight needs a value.
      ...(hot ? { style: { stroke: EDGE_HOT_COLOR, strokeWidth: 1.5 } } : {}),
      markerEnd: { ...EDGE_MARKER, color: hot ? EDGE_HOT_COLOR : EDGE_COLOR },
    };
  });
}

export function presentNodes(
  records: NodeRecord[],
  selectedIds: string[],
  cascadeIds: string[],
  parentId: string | null,
  editRequest: EditRequest | null,
  previousNodes: AppNode[],
): AppNode[] {
  const selectedSet = new Set(selectedIds);
  const cascadeSet = new Set(cascadeIds);
  const previousPositions = new Map(previousNodes.map((node) => [node.id, node.position] as const));
  return records.map((node) => ({
    id: node.id,
    type: "note" as const,
    position: previousPositions.get(node.id) ?? { x: node.x, y: node.y },
    selected: selectedSet.has(node.id),
    data: {
      title: node.title,
      body: node.body,
      inCascade: cascadeSet.has(node.id),
      activeParent: parentId === node.id,
      ...(editRequest?.nodeId === node.id
        ? { editRequest: { field: editRequest.field, nonce: editRequest.nonce } }
        : {}),
    },
  }));
}
