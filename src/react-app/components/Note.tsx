import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useSyncedDraft } from "../lib/useSyncedDraft";
import { useNoteActions } from "./NoteActions";

export type NoteData = {
  title: string;
  body: string;
  inCascade?: boolean;
  /** mouse hover or keyboard focus parent candidate */
  activeParent?: boolean;
};

/** Typed React Flow node for this app (xyflow `Node` + our note data). */
export type AppNode = Node<NoteData, "note">;

function stopMouse(event: MouseEvent) {
  event.stopPropagation();
}

export function Note({ id, data, selected }: NodeProps<AppNode>) {
  const { onChange, onRequestChild } = useNoteActions();
  const [title, setTitle] = useSyncedDraft(data.title);
  const [body, setBody] = useSyncedDraft(data.body);
  const active = selected || data.inCascade || data.activeParent;

  function commitTitle() {
    if (title !== data.title) onChange(id, { title });
  }

  function commitBody() {
    if (body !== data.body) onChange(id, { body });
  }

  function requestChild(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    commitTitle();
    commitBody();
    (event.target as HTMLElement).blur();
    onRequestChild(id);
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      requestChild(event);
      return;
    }
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      setTitle(data.title);
      (event.target as HTMLInputElement).blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitle();
      document
        .querySelector<HTMLTextAreaElement>(`[data-node-id="${id}"][data-node-field="body"]`)
        ?.focus();
    }
  }

  function onBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      requestChild(event);
      return;
    }
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      setBody(data.body);
      (event.target as HTMLTextAreaElement).blur();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitBody();
      (event.target as HTMLTextAreaElement).blur();
    }
  }

  return (
    <div
      style={{
        position: "relative",
        minWidth: 200,
        width: 220,
        background: active ? "var(--node-bg-active)" : "var(--node-bg)",
        border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
        borderRadius: 12,
        padding: "0.65rem 0.75rem",
        boxShadow: "var(--shadow)",
        isolation: "isolate",
        outline: data.activeParent && !selected ? "1px dashed var(--accent)" : "none",
        outlineOffset: 3,
      }}
    >
      {data.activeParent ? (
        <div
          className="mono"
          style={{
            position: "absolute",
            top: -22,
            right: 0,
            fontSize: "0.68rem",
            color: "var(--accent)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "0.1rem 0.35rem",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Tab · child
        </div>
      ) : null}
      <Handle type="target" position={Position.Left} />
      <input
        className="nodrag nopan"
        data-node-id={id}
        data-node-field="title"
        value={title}
        placeholder="Untitled"
        aria-label={`Title for node ${id}`}
        onMouseDown={stopMouse}
        onClick={stopMouse}
        onDoubleClick={stopMouse}
        onKeyDown={onTitleKeyDown}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        onBlur={commitTitle}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "var(--ink)",
          padding: 0,
          marginBottom: 6,
        }}
      />
      <textarea
        className="nodrag nopan nowheel"
        data-node-id={id}
        data-node-field="body"
        value={body}
        placeholder="Write here…"
        aria-label={`Body for node ${id}`}
        rows={3}
        onMouseDown={stopMouse}
        onClick={stopMouse}
        onDoubleClick={stopMouse}
        onKeyDown={onBodyKeyDown}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        onBlur={commitBody}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          resize: "none",
          background: "transparent",
          fontSize: "0.82rem",
          lineHeight: 1.4,
          color: "var(--muted)",
          padding: 0,
          display: "block",
        }}
      />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
