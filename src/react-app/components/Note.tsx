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

/** Card-sized target handle so drops don't have to land on the port dot. */
const DROP_HANDLE_ID = "note-drop";

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
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const titleComposingRef = useRef(false);
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

  // The editors are `pointer-events: none` until the card has focus, so a press
  // anywhere on the card is either a drag or this.
  function onCardEdit(event: MouseEvent) {
    const titleEl = titleRef.current;
    if (!titleEl) return;

    if (event.clientY > titleEl.getBoundingClientRect().bottom) {
      setEditingBody(true);
      return;
    }
    titleEl.focus();
    titleEl.setSelectionRange(titleEl.value.length, titleEl.value.length);
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

  function onTitleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      requestChild(event);
      return;
    }
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      setTitle(data.title);
      (event.target as HTMLTextAreaElement).blur();
      return;
    }
    // Titles stay single logical line; Enter opens body (after IME confirms).
    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing || titleComposingRef.current) return;
      event.preventDefault();
      commitTitle();
      (event.currentTarget as HTMLTextAreaElement).blur();
      // Wait for IME to finish on the title field before focusing body.
      window.setTimeout(() => setEditingBody(true), 0);
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
      finishBodyEdit();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      finishBodyEdit();
    }
  }

  return (
    <div className="note-shell">
      {data.activeParent ? <div className="note-parent-badge mono">Tab · child</div> : null}
      <div
        className={`note-card${active ? " is-active" : ""}${data.activeParent && !selected ? " is-parent" : ""}`}
        onDoubleClick={onCardEdit}
      >
        <textarea
          ref={titleRef}
          className="nodrag nopan note-title-editor"
          data-node-id={id}
          data-node-field="title"
          value={title}
          placeholder="Untitled"
          aria-label={`Title for node ${id}`}
          rows={1}
          onMouseDown={stopMouse}
          onClick={stopMouse}
          onDoubleClick={stopMouse}
          onKeyDown={onTitleKeyDown}
          onCompositionStart={() => {
            titleComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            titleComposingRef.current = false;
          }}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setTitle(e.target.value.replace(/\n/g, " "))
          }
          onBlur={commitTitle}
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
            rows={3}
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
            aria-label={`Body for ${id}. Click to edit.`}
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
      </div>
      {/* Outside the card: it clips overflow, which used to halve their hit area. */}
      <Handle type="target" position={Position.Left} className="note-port" />
      <Handle type="source" position={Position.Right} className="note-port" />
      <Handle
        type="target"
        id={DROP_HANDLE_ID}
        position={Position.Left}
        className="note-drop-zone"
        isConnectableStart={false}
      />
    </div>
  );
}
