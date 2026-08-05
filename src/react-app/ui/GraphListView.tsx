import type { GraphListController } from "../logic/useGraphList";

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

type Props = {
  controller: GraphListController;
  onOpen: (graphId: string) => void;
  onLogout: () => void;
  onOpenTokens: () => void;
  onDeleteAccount: () => void;
};

export function GraphListView({
  controller,
  onOpen,
  onLogout,
  onOpenTokens,
  onDeleteAccount,
}: Props) {
  const { state, actions } = controller;

  return (
    <div className="h-full min-h-screen p-6">
      <header className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-brand m-0 font-semibold text-muted">graphnote</p>
          <h1 className="mt-[0.2rem] text-[2rem] leading-tight font-bold">あなたのボード</h1>
          <p className="mt-2 mb-0 text-sm text-muted">
            考えたいテーマごとに、ノードをまとめられます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="button" onClick={onOpenTokens}>
            連携設定
          </button>
          <button className="btn btn-secondary" type="button" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </header>

      <form
        className="panel mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(event) => void actions.onCreate(event)}
      >
        <label className="grid gap-2 text-sm font-medium">
          新しいボード
          <input
            data-new-note-input
            className="input-surface"
            placeholder="例：次のリリース計画"
            value={state.title}
            onChange={(event) => actions.setTitle(event.target.value)}
          />
        </label>
        <button className="btn btn-accent" type="submit">
          ボードを作る
        </button>
      </form>

      {state.error ? <p className="m-0 text-danger">{state.error}</p> : null}
      {state.loading ? <p className="text-muted">ボードを読み込んでいます…</p> : null}

      <div className="grid gap-3">
        {state.graphs.map((graph, index) => {
          const active = index === state.activeIndex;
          return (
            <article
              key={graph.id}
              className={`panel flex items-center justify-between gap-4 px-[1.1rem] py-4 ${active ? "bg-accent-soft ring-2 ring-accent" : ""}`}
            >
              <button
                type="button"
                className="btn btn-ghost min-w-0 flex-1 p-0 text-left"
                onClick={() => onOpen(graph.id)}
                onFocus={() => actions.setActiveIndex(index)}
              >
                <div className="truncate text-[1.05rem] font-semibold">{graph.title}</div>
                <div className="text-[0.8rem] text-muted">
                  {dateTimeFormat.format(new Date(graph.updated_at))}に更新
                </div>
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void actions.onDelete(graph.id)}
              >
                削除
              </button>
            </article>
          );
        })}
        {!state.loading && state.graphs.length === 0 ? (
          <div className="panel grid place-items-center gap-2 px-6 py-12 text-center">
            <p className="m-0 text-lg font-semibold">最初のボードを作りましょう</p>
            <p className="m-0 max-w-md text-sm text-muted">
              気になっていることや計画したいことを、ひとつのテーマから始められます。
            </p>
          </div>
        ) : null}
      </div>

      <footer className="mt-10 border-t border-line pt-4 text-sm text-muted">
        <button className="btn btn-ghost px-0 text-danger" type="button" onClick={onDeleteAccount}>
          アカウントを削除
        </button>
      </footer>
    </div>
  );
}
