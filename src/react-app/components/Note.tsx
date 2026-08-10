import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  NOTE_MAX_HEIGHT,
  NOTE_MAX_WIDTH,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
} from "../../shared/noteSize";
import type { AppNode } from "../logic/graphEditorTypes";
import { MarkdownContent } from "./MarkdownContent";
import { useNoteActions } from "./NoteActions";

/** Card-sized target handle so drops don't have to land on the port dot. */
const DROP_HANDLE_ID = "note-drop";

function stopMouse(event: MouseEvent) {
  event.stopPropagation();
}

export function Note({ id, data, selected }: NodeProps<AppNode>) {
  const { onChange, onRequestChild, onResize } = useNoteActions();
  const [title, setTitle] = useState(data.title);
  const [body, setBody] = useState(data.body);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const titleComposingRef = useRef(false);
  const handledEditRef = useRef(0);
  const active = selected || data.activeParent;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const check = () => setScrollable(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [data.title, data.body, data.manuallySized]);

  // `N`, `Tab` and `Enter` on the canvas open an editor by asking through node
  // data instead of reaching into the DOM for the field.
  useEffect(() => {
    const request = data.editRequest;
    if (!request || request.nonce === handledEditRef.current) return;
    handledEditRef.current = request.nonce;
    if (request.field === "title") {
      setTitle(data.title);
      setEditingTitle(true);
    } else {
      setBody(data.body);
      setEditingBody(true);
    }
  }, [data.body, data.editRequest, data.title]);

  useEffect(() => {
    if (!editingTitle) return;
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingTitle]);

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

  function finishTitleEdit() {
    commitTitle();
    setEditingTitle(false);
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
    // Closing the editors unmounts the textareas without firing their onBlur,
    // so the commits above stay the only PATCH for this edit.
    setEditingTitle(false);
    setEditingBody(false);
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
      setEditingTitle(false);
      return;
    }
    // Titles stay single logical line; Enter opens body (after IME confirms).
    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing || titleComposingRef.current) return;
      event.preventDefault();
      commitTitle();
      setEditingTitle(false);
      // Wait for IME to finish on the title field before focusing body.
      window.setTimeout(() => {
        setBody(data.body);
        setEditingBody(true);
      }, 0);
    }
  }

  function onBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      requestChild(event);
      return;
    }
    event.stopPropagation();
    // Escape cancels like the title editor; committing here would turn an
    // intended undo into a save.
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
    <div className={`note-shell${data.manuallySized ? " is-manually-sized" : ""}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={NOTE_MIN_WIDTH}
        minHeight={NOTE_MIN_HEIGHT}
        maxWidth={NOTE_MAX_WIDTH}
        maxHeight={NOTE_MAX_HEIGHT}
        color="#60a5fa"
        handleClassName="note-resize-handle"
        lineClassName="note-resize-line"
        onResizeEnd={(_, size) => onResize(id, size)}
      />
      {data.activeParent ? <div className="note-parent-badge">Tabで子ノード</div> : null}
      {/* `nowheel` only while the card actually overflows: React Flow zooms on
          wheel unless the target opts out, and an always-on opt-out would kill
          zooming over every card. */}
      <div
        ref={cardRef}
        className={`note-card${active ? " is-active" : ""}${data.activeParent && !selected ? " is-parent" : ""}${
          scrollable ? " nowheel" : ""
        }`}
      >
        {editingTitle ? (
          <textarea
            ref={titleRef}
            className="nodrag nopan note-title-editor"
            data-node-id={id}
            data-node-field="title"
            value={title}
            placeholder="タイトルなし"
            aria-label="ノードのタイトル"
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
            onBlur={finishTitleEdit}
          />
        ) : (
          // A div, not a disabled input: only a non-focusable preview leaves the
          // press to React Flow, which is what makes the whole card draggable.
          <div
            className="note-title"
            data-node-id={id}
            data-node-field="title"
            onDoubleClick={() => {
              setTitle(data.title);
              setEditingTitle(true);
            }}
          >
            {data.title.trim() || <span className="note-placeholder">タイトルなし</span>}
          </div>
        )}
        {editingBody ? (
          <textarea
            ref={bodyRef}
            className="nodrag nopan nowheel note-body-editor"
            data-node-id={id}
            data-node-field="body"
            value={body}
            placeholder="メモを書く…"
            aria-label="ノードの本文"
            rows={3}
            onMouseDown={stopMouse}
            onClick={stopMouse}
            onDoubleClick={stopMouse}
            onKeyDown={onBodyKeyDown}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
            onBlur={finishBodyEdit}
          />
        ) : (
          <div
            className="note-body-preview"
            data-node-id={id}
            data-node-field="body"
            onDoubleClick={() => {
              setBody(data.body);
              setEditingBody(true);
            }}
          >
            {data.body.trim() ? (
              <MarkdownContent className="note-md">{data.body}</MarkdownContent>
            ) : (
              <span className="note-placeholder">メモを書く…</span>
            )}
          </div>
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
