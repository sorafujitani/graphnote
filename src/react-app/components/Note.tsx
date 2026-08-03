import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSyncedDraft } from "../lib/useSyncedDraft";
import { useNoteActions } from "./NoteActions";

type NoteData = {
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

function MarkdownLink({ href, children }: ComponentPropsWithoutRef<"a">) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

function MarkdownInput(props: ComponentPropsWithoutRef<"input">) {
  return (
    <input
      {...props}
      disabled
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

const markdownComponents: Components = {
  a: MarkdownLink,
  input: MarkdownInput,
};

export function Note({ id, data, selected }: NodeProps<AppNode>) {
  const { onChange, onRequestChild } = useNoteActions();
  const [title, setTitle] = useSyncedDraft(data.title);
  const [body, setBody] = useSyncedDraft(data.body);
  const [editingBody, setEditingBody] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const active = selected || data.inCascade || data.activeParent;

  useEffect(() => {
    if (!editingBody) return;
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editingBody]);

  function commitTitle() {
    if (title !== data.title) onChange(id, { title });
  }

  function commitBody() {
    if (body !== data.body) onChange(id, { body });
  }

  function finishBodyEdit() {
    commitBody();
    setEditingBody(false);
  }

  function requestChild(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    commitTitle();
    commitBody();
    setEditingBody(false);
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
      setEditingBody(true);
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
      setEditingBody(false);
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      finishBodyEdit();
    }
  }

  return (
    <div
      style={{
        position: "relative",
        minWidth: 220,
        width: 260,
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
      {editingBody ? (
        <textarea
          ref={bodyRef}
          className="nodrag nopan nowheel note-body-editor"
          data-node-id={id}
          data-node-field="body"
          value={body}
          placeholder="Write markdown…"
          aria-label={`Markdown body for node ${id}`}
          rows={5}
          onMouseDown={stopMouse}
          onClick={stopMouse}
          onDoubleClick={stopMouse}
          onKeyDown={onBodyKeyDown}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
          onBlur={finishBodyEdit}
        />
      ) : (
        <button
          type="button"
          className="nodrag nopan nowheel note-body-preview"
          data-node-id={id}
          data-node-field="body"
          aria-label={`Markdown body for node ${id}. Click to edit.`}
          onMouseDown={stopMouse}
          onClick={(event) => {
            stopMouse(event);
            setEditingBody(true);
          }}
        >
          {body.trim() ? (
            <div className="note-md">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {body}
              </Markdown>
            </div>
          ) : (
            <span className="note-body-placeholder">Write here…</span>
          )}
        </button>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
