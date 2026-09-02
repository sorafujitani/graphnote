import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { MarkdownContent } from "../../components/MarkdownContent";
import type { AppNode } from "../../logic/graphEditorTypes";

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const KEYBOARD_STEP = 24;
const MOBILE_QUERY = "(max-width: 768px)";

function subscribeToMobileViewport(onStoreChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

type Props = {
  node: AppNode | undefined;
  onReturnToCanvas: () => void;
  onChange: (nodeId: string, patch: { title?: string; body?: string }) => void;
  onToggleTask: (nodeId: string, index: number) => void;
};

/** Full-width editor for the selected card's title and body. */
function InspectorForm({
  node,
  onChange,
  onDone,
}: {
  node: AppNode;
  onChange: Props["onChange"];
  onDone: () => void;
}) {
  const [title, setTitle] = useState(node.data.title);
  const [body, setBody] = useState(node.data.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  function save() {
    const patch: { title?: string; body?: string } = {};
    if (title !== node.data.title) patch.title = title;
    if (body !== node.data.body) patch.body = body;
    if (Object.keys(patch).length > 0) onChange(node.id, patch);
    onDone();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDone();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <input
        className="input-surface w-full font-semibold"
        aria-label="ノードのタイトル"
        value={title}
        onChange={(event) => setTitle(event.target.value.replace(/\n/g, " "))}
        onKeyDown={onKeyDown}
      />
      <textarea
        ref={bodyRef}
        className="input-surface min-h-0 w-full flex-1 resize-none font-mono text-sm leading-relaxed"
        aria-label="ノードの本文"
        placeholder="Markdownで書けます"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">⌘Enter で保存 / Esc で取り消し</span>
        <div className="flex gap-2">
          <button className="btn btn-secondary" type="button" onClick={onDone}>
            取り消し
          </button>
          <button className="btn btn-accent" type="submit">
            保存
          </button>
        </div>
      </div>
    </form>
  );
}

export function NodeInspector({ node, onReturnToCanvas, onChange, onToggleTask }: Props) {
  const mobile = useSyncExternalStore(subscribeToMobileViewport, isMobileViewport, () => false);
  const [open, setOpen] = useState(() => !isMobileViewport());
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const resizeStartRef = useRef({ x: 0, width: DEFAULT_WIDTH });

  useEffect(() => {
    if (mobile) setOpen(false);
  }, [mobile]);

  useEffect(() => {
    if (!resizing) return;

    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (clientX: number) => {
      const delta = resizeStartRef.current.x - clientX;
      setWidth(clampWidth(resizeStartRef.current.width + delta));
    };
    const onMouseMove = (event: globalThis.MouseEvent) => move(event.clientX);
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) move(touch.clientX);
    };
    const finish = () => setResizing(false);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("mouseup", finish, { once: true });
    document.addEventListener("touchend", finish, { once: true });
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("mouseup", finish);
      document.removeEventListener("touchend", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
    };
  }, [resizing]);

  function startResize(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    resizeStartRef.current = { x: event.clientX, width };
    setResizing(true);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setWidth((current) =>
      clampWidth(current + (event.key === "ArrowLeft" ? KEYBOARD_STEP : -KEYBOARD_STEP)),
    );
  }

  const editing = node && editingId === node.id;

  if (!open) {
    if (mobile && !node) return null;
    return (
      <button
        className="btn btn-secondary absolute top-4 right-4 z-10 shadow-lg"
        type="button"
        aria-label="詳細を開く"
        onClick={() => setOpen(true)}
      >
        詳細
      </button>
    );
  }

  return (
    <>
      <div
        role="separator"
        aria-label="詳細の幅を変更"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className="group relative z-10 w-2 shrink-0 cursor-col-resize touch-none bg-surface outline-none max-md:hidden"
        onMouseDown={startResize}
        onKeyDown={resizeWithKeyboard}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-accent group-focus:bg-accent" />
      </div>
      <aside
        aria-label="ノードの詳細"
        className="flex min-h-0 shrink-0 flex-col bg-surface max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:max-w-[calc(100vw-3rem)] max-md:border-l max-md:border-line max-md:shadow-2xl"
        style={{ width }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <p className="m-0 text-xs font-semibold tracking-[0.08em] text-muted">ノードの詳細</p>
          <div className="flex items-center gap-1">
            {node && !editing ? (
              <button
                className="btn btn-ghost px-2 py-1 text-sm"
                type="button"
                onClick={() => setEditingId(node.id)}
              >
                編集
              </button>
            ) : null}
            <button
              className="btn btn-ghost grid size-8 place-items-center px-0 py-0 text-lg"
              type="button"
              aria-label="詳細を閉じる"
              onClick={() => {
                setOpen(false);
                setEditingId(null);
                onReturnToCanvas();
              }}
            >
              ×
            </button>
          </div>
        </header>
        {node && editing ? (
          <InspectorForm
            key={node.id}
            node={node}
            onChange={onChange}
            onDone={() => {
              setEditingId(null);
              onReturnToCanvas();
            }}
          />
        ) : node ? (
          <div data-node-inspector-content className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <h2
              className="mt-0 mb-5 cursor-text text-xl leading-snug font-bold break-words text-ink"
              onDoubleClick={() => setEditingId(node.id)}
            >
              {node.data.title.trim() || "タイトルなし"}
            </h2>
            {node.data.body.trim() ? (
              <div onDoubleClick={() => setEditingId(node.id)}>
                <MarkdownContent
                  className="note-md node-inspector-md"
                  onToggleTask={(index) => onToggleTask(node.id, index)}
                >
                  {node.data.body}
                </MarkdownContent>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost m-0 justify-start px-0 text-sm text-muted"
                onClick={() => setEditingId(node.id)}
              >
                本文はまだありません。ここに書く
              </button>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
            <p className="m-0 max-w-52 text-sm leading-relaxed text-muted">
              ノードを選択すると内容が表示されます
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
