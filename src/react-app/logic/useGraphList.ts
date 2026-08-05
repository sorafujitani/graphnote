import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import type { Graph } from "../../shared/types";
import { isEditableTarget } from "../lib/keyboard";
import { userMessage } from "../lib/userMessage";
import { api } from "../server/api";

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
      setError(userMessage(err, "ボードを読み込めませんでした。もう一度お試しください。"));
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
      const detail = await api.createGraph(title.trim() || "タイトルなしのボード");
      setTitle("");
      onOpen(detail.graph.id);
    } catch (err) {
      setError(userMessage(err, "ボードを作成できませんでした。もう一度お試しください。"));
    }
  }

  async function onDelete(graphId: string) {
    if (!confirm("このボードと、中にあるすべてのノードを削除しますか？")) return;
    try {
      await api.deleteGraph(graphId);
      await refresh();
    } catch (err) {
      setError(userMessage(err, "ボードを削除できませんでした。もう一度お試しください。"));
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
