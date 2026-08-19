import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeRecord } from "../../../shared/types";
import { EDITOR_SHORTCUT_GROUPS, shortcutKey } from "../../logic/editorShortcuts";

type DialogFrameProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
};

function DialogFrame({ title, description, onClose, children, initialFocusRef }: DialogFrameProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (initialFocusRef?.current ?? closeRef.current)?.focus();
  }, [initialFocusRef]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-dialog-title"
        className="panel max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ];
          if (focusable.length === 0) return;
          const first = focusable[0] as HTMLElement;
          const last = focusable.at(-1) as HTMLElement;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="editor-dialog-title" className="m-0 font-brand text-xl font-bold">
              {title}
            </h2>
            {description ? <p className="mt-1 mb-0 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            ref={closeRef}
            className="btn btn-ghost grid size-9 place-items-center p-0 text-xl"
            type="button"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function EditorHelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame
      title="操作ヘルプ"
      description="キャンバスを素早く育てるための操作一覧"
      onClose={onClose}
    >
      <div className="grid max-h-[calc(100vh-9rem)] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        {EDITOR_SHORTCUT_GROUPS.map((group) => (
          <section key={group.label}>
            <h3 className="mt-0 mb-2 text-xs font-semibold tracking-[0.08em] text-accent">
              {group.label}
            </h3>
            <dl className="m-0 grid gap-2">
              {group.items.map((item) => (
                <div key={item.action} className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-body">{item.action}</dt>
                  <dd className="m-0 flex gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-line bg-surface-soft px-2 py-1 font-mono text-xs text-ink"
                      >
                        {shortcutKey(key)}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </DialogFrame>
  );
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function excerpt(body: string, query: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (!compact) return "本文なし";
  const index = normalize(compact).indexOf(normalize(query));
  const start = Math.max(0, index < 0 ? 0 : index - 24);
  const text = compact.slice(start, start + 80);
  return `${start > 0 ? "…" : ""}${text}${start + 80 < compact.length ? "…" : ""}`;
}

export function NodeSearchDialog({
  nodes,
  onSelect,
  onClose,
}: {
  nodes: NodeRecord[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return nodes.slice(0, 20);
    return nodes
      .filter((node) => normalize(`${node.title}\n${node.body}`).includes(needle))
      .slice(0, 50);
  }, [nodes, query]);
  useEffect(() => setActive(0), [query]);

  return (
    <DialogFrame
      title="ノードを検索"
      description="タイトルと本文から、このノート内を探します"
      onClose={onClose}
      initialFocusRef={inputRef}
    >
      <div className="p-4">
        <input
          ref={inputRef}
          className="input-surface w-full"
          aria-label="検索語"
          placeholder="探したい言葉を入力"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(results.length - 1, value + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            } else if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              onSelect(results[active].id);
            }
          }}
        />
        <div className="mt-3 max-h-[min(28rem,calc(100vh-14rem))] overflow-y-auto" role="listbox">
          {results.length === 0 ? (
            <p className="m-0 px-3 py-8 text-center text-sm text-muted">
              一致するノードはありません
            </p>
          ) : (
            results.map((node, index) => (
              <button
                key={node.id}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`block w-full rounded-xl px-3 py-3 text-left hover:bg-surface-soft ${
                  index === active ? "bg-accent-soft ring-1 ring-accent/50" : ""
                }`}
                onMouseEnter={() => setActive(index)}
                onClick={() => onSelect(node.id)}
              >
                <strong className="block truncate text-sm">
                  {node.title.trim() || "タイトルなし"}
                </strong>
                <span className="mt-1 block truncate text-xs text-muted">
                  {excerpt(node.body, query)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </DialogFrame>
  );
}
