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
  selectedEdgeIds: Set<string>,
  hiddenNodeIds: Set<string> = new Set(),
): Edge[] {
  return edges.map((edge) => {
    const hot = selectedEdgeIds.has(edge.id);
    return {
      id: edge.id,
      source: edge.source_id,
      target: edge.target_id,
      label: edge.label || undefined,
      hidden: hiddenNodeIds.has(edge.source_id) || hiddenNodeIds.has(edge.target_id),
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

type NoteData = AppNode["data"];

function sameData(a: NoteData, b: NoteData): boolean {
  return (
    a.title === b.title &&
    a.body === b.body &&
    a.manuallySized === b.manuallySized &&
    a.activeParent === b.activeParent &&
    a.editRequest?.nonce === b.editRequest?.nonce &&
    a.editRequest?.field === b.editRequest?.field &&
    a.collapsedCount === b.collapsedCount
  );
}

/**
 * Patches the previous React Flow nodes instead of rebuilding them. React Flow
 * compares node references (`checkEquality` in `adoptUserNodes`); a rebuilt
 * object drops `measured`/`handleBounds` and forces every card through a
 * re-measure, which is why edges used to flicker on hover.
 */
export type Visibility = {
  /** Cards inside a collapsed branch. */
  hidden: Set<string>;
  /** Collapsed card → how many descendants it hides. */
  collapsedCounts: Map<string, number>;
};

const EVERYTHING_VISIBLE: Visibility = { hidden: new Set(), collapsedCounts: new Map() };

export function presentNodes(
  records: NodeRecord[],
  selectedIds: string[],
  parentId: string | null,
  editRequest: EditRequest | null,
  previousNodes: AppNode[],
  visibility: Visibility = EVERYTHING_VISIBLE,
): AppNode[] {
  const selectedSet = new Set(selectedIds);
  const prevById = new Map(previousNodes.map((node) => [node.id, node] as const));
  let changed = previousNodes.length !== records.length;
  const next = records.map((node, index) => {
    const prev = prevById.get(node.id);
    const selected = selectedSet.has(node.id);
    const style =
      node.width === null && node.height === null
        ? undefined
        : {
            ...(node.width === null ? {} : { width: node.width }),
            ...(node.height === null ? {} : { height: node.height }),
          };
    const collapsedCount = visibility.collapsedCounts.get(node.id);
    const hidden = visibility.hidden.has(node.id);
    const data: NoteData = {
      title: node.title,
      body: node.body,
      manuallySized: node.width !== null || node.height !== null,
      activeParent: parentId === node.id,
      ...(editRequest?.nodeId === node.id
        ? { editRequest: { field: editRequest.field, nonce: editRequest.nonce } }
        : {}),
      ...(collapsedCount ? { collapsedCount } : {}),
    };
    if (
      prev &&
      prev.selected === selected &&
      Boolean(prev.hidden) === hidden &&
      sameData(prev.data, data) &&
      prev.style?.width === style?.width &&
      prev.style?.height === style?.height
    ) {
      if (previousNodes[index] !== prev) changed = true;
      return prev;
    }
    changed = true;
    const patched: AppNode = {
      ...(prev ?? { id: node.id, type: "note" as const }),
      position: prev?.position ?? { x: node.x, y: node.y },
      selected,
      hidden,
      data,
    };
    // Replace, not merge: a dimension reset to null must not leave the old
    // width/height behind in the style object.
    if (style) patched.style = style;
    else delete patched.style;
    return patched;
  });
  return changed ? next : previousNodes;
}
