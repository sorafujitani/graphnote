import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { MarkdownContent } from "../../components/MarkdownContent";
import type { AppNode } from "../../logic/graphEditorTypes";

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const KEYBOARD_STEP = 24;

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

type Props = {
  node: AppNode | undefined;
  onReturnToCanvas: () => void;
};

export function NodeInspector({ node, onReturnToCanvas }: Props) {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  const [open, setOpen] = useState(() => !window.matchMedia("(max-width: 768px)").matches);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: DEFAULT_WIDTH });

  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const update = () => {
      setMobile(query.matches);
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (mobile && !node) setOpen(false);
  }, [mobile, node]);

  useEffect(() => {
    if (!resizing) return;

    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const resize = (event: globalThis.MouseEvent) => {
      const delta = resizeStartRef.current.x - event.clientX;
      setWidth(clampWidth(resizeStartRef.current.width + delta));
    };
    const finish = () => setResizing(false);
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", finish, { once: true });
    return () => {
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", finish);
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
          <button
            className="btn btn-ghost grid size-8 place-items-center px-0 py-0 text-lg"
            type="button"
            aria-label="詳細を閉じる"
            onClick={() => {
              setOpen(false);
              onReturnToCanvas();
            }}
          >
            ×
          </button>
        </header>
        {node ? (
          <div data-node-inspector-content className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <h2 className="mt-0 mb-5 text-xl leading-snug font-bold break-words text-ink">
              {node.data.title.trim() || "タイトルなし"}
            </h2>
            {node.data.body.trim() ? (
              <MarkdownContent className="note-md node-inspector-md">
                {node.data.body}
              </MarkdownContent>
            ) : (
              <p className="m-0 text-sm text-muted">本文はまだありません</p>
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
