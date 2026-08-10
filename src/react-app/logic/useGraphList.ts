import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import type { Graph, GraphExport } from "../../shared/types";
import { isEditableTarget, isInteractiveTarget } from "../lib/keyboard";
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
  const [busy, setBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const busyRef = useRef(false);

  /** One in-flight mutation at a time: Enter held on 作成 must not make two notes. */
  async function withBusy(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

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
      setError(userMessage(err, "ノートを読み込めませんでした。もう一度お試しください。"));
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
    await withBusy(async () => {
      try {
        const detail = await api.createGraph(title.trim() || "タイトルなしのノート");
        setTitle("");
        onOpen(detail.graph.id);
      } catch (err) {
        setError(userMessage(err, "ノートを作成できませんでした。もう一度お試しください。"));
      }
    });
  }

  async function onDelete(graphId: string) {
    if (!confirm("このノートと、中にあるすべてのノードを削除しますか？")) return;
    await withBusy(async () => {
      try {
        await api.deleteGraph(graphId);
        await refresh();
      } catch (err) {
        setError(userMessage(err, "ノートを削除できませんでした。もう一度お試しください。"));
      }
    });
  }

  async function onImportFile(file: File) {
    await withBusy(async () => {
      setError(null);
      try {
        const text = await file.text();
        let payload: GraphExport;
        try {
          payload = JSON.parse(text) as GraphExport;
        } catch {
          setError("ダウンロードファイルの内容を確認できませんでした。");
          return;
        }
        const detail = await api.importGraph(payload);
        onOpen(detail.graph.id);
      } catch (err) {
        setError(
          userMessage(err, "読み込めませんでした。ファイルを確認してもう一度お試しください。"),
        );
      }
    });
  }

  const onListKeyDown = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur();
      }
      return;
    }
    // Enter on a focused button (menu, delete, a note row) must press that
    // button, not act on whichever row happens to be highlighted.
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && isInteractiveTarget(event.target)) {
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
    state: { graphs, title, error, loading, busy, activeIndex },
    actions: { setTitle, setActiveIndex, onCreate, onDelete, onImportFile },
  };
}

export type GraphListController = ReturnType<typeof useGraphList>;
