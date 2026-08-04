import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import type { Graph } from "../../shared/types";
import { ApiError, api } from "../server/api";
import { isEditableTarget } from "../lib/keyboard";

export type UseGraphListOptions = {
  onOpen: (graphId: string) => void;
};

export function useGraphList({ onOpen }: UseGraphListOptions) {
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

  return {
    state: { graphs, title, error, loading, activeIndex },
    actions: { setTitle, setActiveIndex, onCreate, onDelete },
  };
}

export type GraphListController = ReturnType<typeof useGraphList>;
