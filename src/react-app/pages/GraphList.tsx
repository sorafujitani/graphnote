import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import type { Graph } from "../../shared/types";
import { ApiError, api } from "../api";
import { isEditableTarget } from "../lib/keyboard";

type Props = {
  onOpen: (graphId: string) => void;
  onLogout: () => void;
  onOpenTokens: () => void;
  onDeleteAccount: () => void;
};

export function GraphList({ onOpen, onLogout, onOpenTokens, onDeleteAccount }: Props) {
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  async function refresh(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listGraphs();
      if (signal?.aborted) return;
      setGraphs(data.graphs);
      setActiveIndex((prev) =>
        data.graphs.length === 0 ? 0 : Math.min(prev, data.graphs.length - 1),
      );
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof ApiError ? err.message : "failed to load");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  async function onCreate(event?: FormEvent) {
    event?.preventDefault();
    try {
      const detail = await api.createGraph(title.trim() || "Untitled note");
      setTitle("");
      onOpen(detail.graph.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "create failed");
    }
  }

  async function onDelete(graphId: string) {
    if (!confirm("Delete this note and everything inside it?")) return;
    try {
      await api.deleteGraph(graphId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "delete failed");
    }
  }

  const onListKeyDown = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur();
      }
      return;
    }
    if (event.key === "n") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-new-note-input]")?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (graphs.length === 0 ? 0 : Math.min(prev + 1, graphs.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const graph = graphs[activeIndex];
      if (!graph) return;
      event.preventDefault();
      onOpen(graph.id);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      const graph = graphs[activeIndex];
      if (!graph) return;
      event.preventDefault();
      void onDelete(graph.id);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onListKeyDown);
    return () => window.removeEventListener("keydown", onListKeyDown);
  }, []);

  return (
    <div className="app-shell" style={{ padding: "1.5rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <p className="muted" style={{ margin: 0 }}>
            graphnote
          </p>
          <h1 style={{ margin: "0.2rem 0 0", fontSize: "2rem" }}>Notes</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn secondary" type="button" onClick={onOpenTokens}>
            Integrations
          </button>
          <button className="btn secondary" type="button" onClick={onDeleteAccount}>
            Delete account
          </button>
          <button className="btn secondary" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <form
        className="panel"
        onSubmit={(event) => void onCreate(event)}
        style={{
          display: "flex",
          gap: "0.75rem",
          padding: "1rem",
          marginBottom: "1rem",
          alignItems: "center",
        }}
      >
        <input
          data-new-note-input
          style={{
            flex: 1,
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "0.65rem 0.8rem",
            background: "var(--bg-soft)",
            color: "var(--ink)",
          }}
          placeholder="New note title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn accent" type="submit">
          Create
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted">Loading notes…</p> : null}
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
        Tip: use ↑↓ to browse, Enter to open
      </p>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {graphs.map((graph, index) => {
          const active = index === activeIndex;
          return (
            <article
              key={graph.id}
              className="panel"
              style={{
                padding: "1rem 1.1rem",
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                alignItems: "center",
                outline: active ? "2px solid var(--accent)" : "none",
                background: active ? "var(--accent-soft)" : "var(--bg-elevated)",
              }}
            >
              <button
                type="button"
                className="btn ghost"
                onClick={() => onOpen(graph.id)}
                onFocus={() => setActiveIndex(index)}
                style={{ textAlign: "left", padding: 0, flex: 1 }}
              >
                <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{graph.title}</div>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Updated {new Date(graph.updated_at).toLocaleString()}
                </div>
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => void onDelete(graph.id)}
              >
                Delete
              </button>
            </article>
          );
        })}
        {!loading && graphs.length === 0 ? (
          <p className="muted">No notes yet. Create one above to get started.</p>
        ) : null}
      </div>
    </div>
  );
}
