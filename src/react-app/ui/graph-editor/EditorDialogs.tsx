import { useEffect, useMemo, useRef, useState } from "react";
import type { EdgeRecord, NodeRecord } from "../../../shared/types";
import { DialogFrame } from "../../components/Dialog";
import { EDITOR_SHORTCUT_GROUPS, shortcutKey } from "../../logic/editorShortcuts";
import type { ExportEntry } from "../../server/api";

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

const LIST_SHORTCUTS = [
  { action: "一覧でノートを選ぶ", keys: ["↑", "↓"] },
  { action: "一覧で選んだノートを開く", keys: ["Enter"] },
];

export function EditorHelpDialog({ onClose }: { onClose: () => void }) {
  const shortcutGroups = [
    { label: "ノート一覧", items: LIST_SHORTCUTS },
    ...EDITOR_SHORTCUT_GROUPS,
  ];

  return (
    <DialogFrame
      title="操作ヘルプ"
      description="ノート一覧とキャンバスの操作一覧"
      onClose={onClose}
    >
      <div className="grid max-h-[calc(100vh-9rem)] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        {shortcutGroups.map((group) => (
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

export function EdgeLabelDialog({
  edge,
  nodes,
  onSave,
  onClose,
}: {
  edge: EdgeRecord;
  nodes: NodeRecord[];
  onSave: (label: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(edge.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const name = (id: string) => nodes.find((node) => node.id === id)?.title.trim() || "タイトルなし";
  return (
    <DialogFrame
      title="つながりのラベル"
      description={`${name(edge.source_id)} → ${name(edge.target_id)}`}
      onClose={onClose}
      initialFocusRef={inputRef}
    >
      <form
        className="grid gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(label.trim());
        }}
      >
        <input
          ref={inputRef}
          className="input-surface w-full"
          aria-label="ラベル"
          placeholder="例：理由、次に、参照"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          {edge.label ? (
            <button className="btn btn-secondary mr-auto" type="button" onClick={() => onSave("")}>
              ラベルを消す
            </button>
          ) : null}
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-accent" type="submit">
            保存
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function RestoreDialog({
  exports,
  busy,
  onRestore,
  onClose,
}: {
  exports: ExportEntry[] | null;
  busy: boolean;
  onRestore: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <DialogFrame
      title="バックアップから復元"
      description="ダウンロード時と毎晩の自動保存分がここに残ります。選ぶと今のノートの内容が置き換わります。"
      onClose={onClose}
    >
      <div className="max-h-[min(28rem,calc(100vh-14rem))] overflow-y-auto p-4">
        {exports === null ? (
          <p className="m-0 px-3 py-8 text-center text-sm text-muted">読み込んでいます…</p>
        ) : exports.length === 0 ? (
          <p className="m-0 px-3 py-8 text-center text-sm text-muted">
            バックアップはまだありません。メニューの「ダウンロード」で保存できます。
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {exports.map((entry) => (
              <li
                key={entry.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {dateTimeFormat.format(new Date(entry.uploaded))}
                  </div>
                  <div className="text-xs text-muted">
                    {entry.kind === "auto" ? "自動保存" : "ダウンロード時"} ·{" "}
                    {formatBytes(entry.size)}
                  </div>
                </div>
                <button
                  className="btn btn-secondary shrink-0"
                  type="button"
                  disabled={busy}
                  onClick={() => onRestore(entry.name)}
                >
                  この時点に戻す
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogFrame>
  );
}
