import type { GraphListController } from "../logic/useGraphList";

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
          <p className="m-0 text-muted">graphnote</p>
          <h1 className="mt-[0.2rem] text-[2rem] leading-tight font-bold">Notes</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="button" onClick={onOpenTokens}>
            Integrations
          </button>
          <button className="btn btn-secondary" type="button" onClick={onDeleteAccount}>
            Delete account
          </button>
          <button className="btn btn-secondary" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <form
        className="panel mb-4 flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-center"
        onSubmit={(event) => void actions.onCreate(event)}
      >
        <input
          data-new-note-input
          className="input-surface flex-1"
          placeholder="New note title"
          value={state.title}
          onChange={(event) => actions.setTitle(event.target.value)}
        />
        <button className="btn btn-accent" type="submit">
          Create
        </button>
      </form>

      {state.error ? <p className="m-0 text-danger">{state.error}</p> : null}
      {state.loading ? <p className="text-muted">Loading notes…</p> : null}
      <p className="mb-3 text-sm text-muted">Tip: use ↑↓ to browse, Enter to open</p>

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
                  Updated {new Date(graph.updated_at).toLocaleString()}
                </div>
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void actions.onDelete(graph.id)}
              >
                Delete
              </button>
            </article>
          );
        })}
        {!state.loading && state.graphs.length === 0 ? (
          <p className="text-muted">No notes yet. Create one above to get started.</p>
        ) : null}
      </div>
    </div>
  );
}
