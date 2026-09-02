import { useEffect, useRef } from "react";
import { QUOTA } from "../../shared/quota";
import type { PublicUser } from "../../shared/types";
import { AppMenu } from "../components/AppMenu";
import { ConfirmDialog } from "../components/Dialog";
import type { GraphListController, GraphSort } from "../logic/useGraphList";

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

const SORT_LABELS: Record<GraphSort, string> = {
  updated: "更新が新しい順",
  created: "作成が新しい順",
  title: "タイトル順",
  size: "ノードが多い順",
};

type Props = {
  controller: GraphListController;
  user: PublicUser | null;
  onOpen: (graphId: string) => void;
  onLogout: () => void;
  onOpenTokens: () => void;
  onOpenHelp: () => void;
  onDeleteAccount: () => void;
};

export function GraphListView({
  controller,
  user,
  onOpen,
  onLogout,
  onOpenTokens,
  onOpenHelp,
  onDeleteAccount,
}: Props) {
  const { state, actions } = controller;
  const importInputRef = useRef<HTMLInputElement>(null);
  const newNoteRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const activeId = state.graphs[state.activeIndex]?.id;

  // The keyboard cursor and the focused row are one thing, so screen readers
  // and scrolling follow the arrow keys.
  useEffect(() => {
    if (!activeId) return;
    const row = rowRefs.current.get(activeId);
    if (!row || document.activeElement === row) return;
    const focusInsideList = row.closest("[data-note-list]")?.contains(document.activeElement);
    if (focusInsideList || document.activeElement === document.body) {
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    }
  }, [activeId]);

  const remaining = QUOTA.maxGraphsPerUser - state.totalGraphs;

  return (
    <div className="h-full min-h-screen p-6">
      <header className="relative z-20 mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-brand m-0 font-semibold text-muted">graphnote</p>
          <h1 className="mt-[0.2rem] text-[2rem] leading-tight font-bold">あなたのノート</h1>
          <p className="mt-2 mb-0 text-sm text-muted">
            考えたいテーマごとに、ノードをまとめられます。
          </p>
        </div>
        <AppMenu user={user}>
          {(close) => (
            <>
              <p className="m-0 px-3 pt-1 pb-2 text-xs text-muted">
                ノート {state.totalGraphs} / {QUOTA.maxGraphsPerUser}
              </p>
              <button
                className="btn btn-ghost flex w-full justify-start"
                type="button"
                onClick={() => {
                  close();
                  onOpenHelp();
                }}
              >
                使い方
              </button>
              <button
                className="btn btn-ghost flex w-full justify-start"
                type="button"
                onClick={() => {
                  close();
                  onOpenTokens();
                }}
              >
                CLI連携
              </button>
              <a
                className="btn btn-ghost flex w-full justify-start"
                href="https://github.com/sorafujitani/graphnote/issues"
                target="_blank"
                rel="noreferrer"
                onClick={close}
              >
                フィードバック
              </a>
              <button
                className="btn btn-ghost flex w-full justify-start"
                type="button"
                onClick={() => {
                  close();
                  onLogout();
                }}
              >
                ログアウト
              </button>
              <div className="mx-2 border-t border-line" />
              <button
                className="btn btn-ghost flex w-full justify-start text-danger"
                type="button"
                onClick={() => {
                  close();
                  onDeleteAccount();
                }}
              >
                アカウントを削除
              </button>
            </>
          )}
        </AppMenu>
      </header>

      <form
        className="panel mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(event) => void actions.onCreate(event)}
      >
        <label className="grid gap-2 text-sm font-medium">
          新しいノート
          <input
            ref={newNoteRef}
            data-new-note-input
            className="input-surface"
            placeholder="例：次のリリース計画"
            value={state.title}
            onChange={(event) => actions.setTitle(event.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button
            className="btn btn-accent"
            type="submit"
            disabled={state.busy || remaining <= 0}
            title={remaining <= 0 ? "ノートの上限に達しています" : undefined}
          >
            ノートを作る
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={state.busy}
            onClick={() => importInputRef.current?.click()}
          >
            ファイルから復元
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="ダウンロードしたノートのファイルを選ぶ"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void actions.onImportFile(file);
            }}
          />
        </div>
      </form>

      {state.totalGraphs > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            data-search-input
            type="search"
            className="input-surface min-w-0 flex-1"
            aria-label="ノートを検索"
            placeholder="ノート名や、ノードの本文から探す（/）"
            value={state.query}
            onChange={(event) => actions.setQuery(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            並び順
            <select
              aria-label="並び順"
              className="input-surface py-[0.45rem]"
              value={state.sort}
              onChange={(event) => actions.changeSort(event.target.value as GraphSort)}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {remaining <= 5 ? (
            <span className={`text-xs ${remaining <= 0 ? "text-danger" : "text-muted"}`}>
              あと{Math.max(remaining, 0)}件つくれます
            </span>
          ) : null}
        </div>
      ) : null}

      {state.error ? (
        <div role="alert" className="mb-3 flex items-start gap-3 text-danger">
          <p className="m-0 flex-1">{state.error}</p>
          <button
            type="button"
            className="btn btn-ghost px-2 py-1"
            aria-label="エラーを閉じる"
            onClick={actions.dismissError}
          >
            ×
          </button>
        </div>
      ) : null}
      {state.notice ? (
        <div role="status" className="panel mb-3 flex items-center gap-3 px-4 py-3 text-sm">
          <p className="m-0 flex-1">{state.notice.message}</p>
          {state.notice.action ? (
            <button
              type="button"
              className="btn btn-secondary px-3 py-1"
              onClick={() => {
                const run = state.notice?.action?.run;
                actions.dismissNotice();
                run?.();
              }}
            >
              {state.notice.action.label}
            </button>
          ) : null}
        </div>
      ) : null}

      {state.loading ? (
        <div className="grid gap-3" aria-label="ノートを読み込んでいます" role="status">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="panel flex items-center justify-between gap-4 px-[1.1rem] py-4"
            >
              <div className="grid flex-1 gap-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-surface-soft" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-surface-soft" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {state.graphs.length > 0 ? (
        <p className="m-0 mb-2 px-1 text-xs text-muted">↑↓で選択 / Enterで開く</p>
      ) : null}

      <div className="grid gap-3" data-note-list>
        {state.graphs.map((graph, index) => {
          const active = index === state.activeIndex;
          const renaming = state.renamingId === graph.id;
          return (
            <article
              key={graph.id}
              className={`panel flex items-center justify-between gap-4 px-[1.1rem] py-4 ${active ? "bg-accent-soft ring-2 ring-accent" : ""}`}
            >
              {renaming ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void actions.commitRename();
                  }}
                >
                  <input
                    className="input-surface min-w-0 flex-1"
                    aria-label="ノート名"
                    autoFocus
                    value={state.renameDraft}
                    onChange={(event) => actions.setRenameDraft(event.target.value)}
                    onBlur={() => void actions.commitRename()}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        actions.cancelRename();
                      }
                    }}
                  />
                </form>
              ) : (
                <button
                  ref={(element) => {
                    if (element) rowRefs.current.set(graph.id, element);
                    else rowRefs.current.delete(graph.id);
                  }}
                  type="button"
                  className="btn btn-ghost min-w-0 flex-1 p-0 text-left focus-visible:ring-0"
                  onClick={() => onOpen(graph.id)}
                  onFocus={() => actions.setActiveIndex(index)}
                >
                  <div className="truncate text-[1.05rem] font-semibold">{graph.title}</div>
                  <div className="text-[0.8rem] text-muted">
                    {dateTimeFormat.format(new Date(graph.updated_at))}に更新 · ノード{" "}
                    {graph.node_count}
                  </div>
                </button>
              )}
              <div className="flex shrink-0 gap-2">
                <button
                  className="btn btn-ghost"
                  type="button"
                  aria-label={`「${graph.title}」の名前を変更`}
                  onClick={() => actions.startRename(graph.id)}
                >
                  名前を変更
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  aria-label={`「${graph.title}」を削除`}
                  onClick={() => void actions.onDelete(graph.id)}
                >
                  削除
                </button>
              </div>
            </article>
          );
        })}
        {!state.loading && state.totalGraphs === 0 ? (
          <div className="panel grid place-items-center gap-3 px-6 py-12 text-center">
            <p className="m-0 text-lg font-semibold">最初のノートを作りましょう</p>
            <p className="m-0 max-w-md text-sm text-muted">
              気になっていることや計画したいことを、ひとつのテーマから始められます。
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button
                className="btn btn-accent"
                type="button"
                onClick={() => newNoteRef.current?.focus()}
              >
                ノートを作る
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => importInputRef.current?.click()}
              >
                ファイルから復元
              </button>
              <button className="btn btn-ghost" type="button" onClick={onOpenHelp}>
                使い方を見る
              </button>
            </div>
          </div>
        ) : null}
        {!state.loading && state.totalGraphs > 0 && state.graphs.length === 0 ? (
          <p className="m-0 px-2 py-6 text-center text-sm text-muted">
            「{state.query}」に一致するノート名はありません
          </p>
        ) : null}
      </div>

      {state.query.trim().length >= 2 ? (
        <section className="mt-6" aria-label="ノードの一致">
          <h2 className="mt-0 mb-2 text-xs font-semibold tracking-[0.08em] text-muted">
            ノードの一致{state.searching ? "（検索中…）" : `（${state.hits.length}件）`}
          </h2>
          {state.hits.length === 0 && !state.searching ? (
            <p className="m-0 text-sm text-muted">
              本文やタイトルに「{state.query}」を含むノードはありません
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {state.hits.map((hit) => (
                <li key={hit.node_id}>
                  <button
                    type="button"
                    className="panel block w-full px-4 py-3 text-left hover:bg-surface-soft"
                    onClick={() => actions.openHit(hit)}
                  >
                    <span className="block text-xs text-muted">{hit.graph_title}</span>
                    <strong className="block truncate text-sm">
                      {hit.title.trim() || "タイトルなし"}
                    </strong>
                    {hit.snippet ? (
                      <span className="mt-1 block truncate text-xs text-muted">{hit.snippet}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="mt-8">
        {state.trash === null ? (
          <button
            className="btn btn-ghost text-sm text-muted"
            type="button"
            onClick={() => void actions.loadTrash()}
          >
            削除したノートを表示
          </button>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="m-0 text-xs font-semibold tracking-[0.08em] text-muted">
                削除したノート（{state.trash.length}件・{QUOTA.trashRetentionDays}
                日後に自動で消えます）
              </h2>
              <button
                className="btn btn-ghost px-2 py-1 text-sm"
                type="button"
                onClick={actions.hideTrash}
              >
                閉じる
              </button>
            </div>
            {state.trash.length === 0 ? (
              <p className="m-0 text-sm text-muted">削除したノートはありません</p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {state.trash.map((graph) => (
                  <li
                    key={graph.id}
                    className="panel flex items-center justify-between gap-4 px-[1.1rem] py-3 opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{graph.title}</div>
                      <div className="text-[0.8rem] text-muted">
                        {graph.deleted_at
                          ? `${dateTimeFormat.format(new Date(graph.deleted_at))}に削除`
                          : ""}{" "}
                        · ノード {graph.node_count}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={state.busy}
                        onClick={() => void actions.restoreGraph(graph.id)}
                      >
                        元に戻す
                      </button>
                      <button
                        className="btn btn-ghost text-danger"
                        type="button"
                        disabled={state.busy}
                        onClick={() => void actions.onPurge(graph.id)}
                      >
                        完全に削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {state.confirmDialog ? (
        <ConfirmDialog
          title={state.confirmDialog.title}
          message={state.confirmDialog.message}
          confirmLabel={state.confirmDialog.confirmLabel}
          danger={state.confirmDialog.danger}
          onResolve={state.confirmDialog.resolve}
        />
      ) : null}
    </div>
  );
}
