import type { Node } from "@xyflow/react";

export type EditRequest = { nodeId: string; field: "title" | "body"; nonce: number };

type NoteData = {
  title: string;
  body: string;
  /** The card fills the React Flow dimensions after its first manual resize. */
  manuallySized?: boolean;
  /** Mouse hover or keyboard focus parent candidate. */
  activeParent?: boolean;
  /** Editor the canvas asked to open; the nonce lets the same one be re-asked. */
  editRequest?: Pick<EditRequest, "field" | "nonce">;
  /** Descendants hidden behind this card; absent when the branch is open. */
  collapsedCount?: number;
};

/** Typed React Flow node for this app (xyflow `Node` + our note data). */
export type AppNode = Node<NoteData, "note">;
