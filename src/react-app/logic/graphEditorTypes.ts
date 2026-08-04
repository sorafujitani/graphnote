import type { Node } from "@xyflow/react";

export type EditRequest = { nodeId: string; field: "title" | "body"; nonce: number };

type NoteData = {
  title: string;
  body: string;
  inCascade?: boolean;
  /** Mouse hover or keyboard focus parent candidate. */
  activeParent?: boolean;
  /** Editor the canvas asked to open; the nonce lets the same one be re-asked. */
  editRequest?: Pick<EditRequest, "field" | "nonce">;
};

/** Typed React Flow node for this app (xyflow `Node` + our note data). */
export type AppNode = Node<NoteData, "note">;
