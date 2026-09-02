import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { QUOTA } from "../../shared/quota";
import type { GraphExport, GraphSummary, SearchHit } from "../../shared/types";
import { isEditableTarget, isInteractiveTarget } from "../lib/keyboard";
import { userMessage } from "../lib/userMessage";
import { api } from "../server/api";
import { useConfirm } from "./useConfirm";

export type UseGraphListOptions = {
  onOpen: (graphId: string, nodeId?: string) => void;
};

export type GraphSort = "updated" | "created" | "title" | "size";

const SORT_STORAGE_KEY = "graphnote:list-sort";

function readSort(): GraphSort {
  try {
    const value = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (value === "created" || value === "title" || value === "size") return value;
  } catch {
    /* private mode */
  }
  return "updated";
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function sortGraphs(graphs: GraphSummary[], sort: GraphSort): GraphSummary[] {
  const sorted = [...graphs];
  if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "ja"));
  else if (sort === "created") sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else if (sort === "size") sorted.sort((a, b) => b.node_count - a.node_count);
  return sorted;
}

export type ListNotice = { message: string; action?: { label: string; run: () => void } };

export function useGraphList({ onOpen }: UseGraphListOptions) {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [trash, setTrash] = useState<GraphSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GraphSort>(readSort);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const busyRef = useRef(false);
  const { pending: confirmDialog, confirm } = useConfirm();

  const noticeTimerRef = useRef<number | null>(null);
  const showNotice = useCallback((message: string, action?: ListNotice["action"]) => {
    setNotice({ message, action });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), action ? 8000 : 4000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

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

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listGraphs();
      if (signal?.aborted) return;
      setGraphs(data.graphs);
    } catch (err) {
      if (signal?.aborted) return;
      setError(userMessage(err, "ノートを読み込めませんでした。もう一度お試しください。"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const loadTrash = useCallback(async () => {
    try {
      const data = await api.listGraphs("trash");
      setTrash(data.graphs);
    } catch (err) {
      setError(userMessage(err, "削除したノートを読み込めませんでした。"));
    }
  }, []);

  const visibleGraphs = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = needle
      ? graphs.filter((graph) => normalize(graph.title).includes(needle))
      : graphs;
    return sortGraphs(filtered, sort);
  }, [graphs, query, sort]);

  useEffect(() => {
    setActiveIndex((prev) =>
      visibleGraphs.length === 0 ? 0 : Math.min(prev, visibleGraphs.length - 1),
    );
  }, [visibleGraphs]);

  // Cross-note card search: debounced, cancellable, only for real queries.
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .search(needle, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setHits(data.hits);
        })
        .catch(() => {
          if (!controller.signal.aborted) setHits([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function changeSort(next: GraphSort) {
    setSort(next);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }

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

  const restoreGraph = useCallback(
    async (graphId: string) => {
      try {
        await api.restoreGraph(graphId);
        setNotice(null);
        await refresh();
        setTrash((prev) => prev?.filter((graph) => graph.id !== graphId) ?? prev);
      } catch (err) {
        setError(userMessage(err, "ノートを元に戻せませんでした。もう一度お試しください。"));
      }
    },
    [refresh],
  );

  async function onDelete(graphId: string) {
    const graph = graphs.find((item) => item.id === graphId);
    if (!graph) return;
    const ok = await confirm({
      title: "ノートを削除",
      message: `「${graph.title}」を削除します。${QUOTA.trashRetentionDays}日以内なら「削除したノート」から元に戻せます。`,
      confirmLabel: "削除する",
      danger: true,
    });
    if (!ok) return;
    await withBusy(async () => {
      try {
        await api.deleteGraph(graphId);
        setGraphs((prev) => prev.filter((item) => item.id !== graphId));
        if (trash) void loadTrash();
        showNotice(`「${graph.title}」を削除しました。`, {
          label: "元に戻す",
          run: () => void restoreGraph(graphId),
        });
      } catch (err) {
        setError(userMessage(err, "ノートを削除できませんでした。もう一度お試しください。"));
      }
    });
  }

  async function onPurge(graphId: string) {
    const graph = trash?.find((item) => item.id === graphId);
    if (!graph) return;
    const ok = await confirm({
      title: "完全に削除",
      message: `「${graph.title}」を完全に削除します。この操作は元に戻せません。`,
      confirmLabel: "完全に削除する",
      danger: true,
    });
    if (!ok) return;
    await withBusy(async () => {
      try {
        await api.purgeGraph(graphId);
        setTrash((prev) => prev?.filter((item) => item.id !== graphId) ?? prev);
      } catch (err) {
        setError(userMessage(err, "ノートを削除できませんでした。もう一度お試しください。"));
      }
    });
  }

  function startRename(graphId: string) {
    const graph = graphs.find((item) => item.id === graphId);
    if (!graph) return;
    setRenamingId(graphId);
    setRenameDraft(graph.title);
  }

  function cancelRename() {
    setRenamingId(null);
  }

  async function commitRename() {
    const graphId = renamingId;
    if (!graphId) return;
    const graph = graphs.find((item) => item.id === graphId);
    const next = renameDraft.trim();
    setRenamingId(null);
    if (!graph || !next || next === graph.title) return;
    setGraphs((prev) =>
      prev.map((item) => (item.id === graphId ? { ...item, title: next } : item)),
    );
    try {
      const { graph: saved } = await api.renameGraph(graphId, next);
      setGraphs((prev) => prev.map((item) => (item.id === graphId ? { ...item, ...saved } : item)));
    } catch (err) {
      setGraphs((prev) => prev.map((item) => (item.id === graphId ? graph : item)));
      setError(userMessage(err, "ノート名を変更できませんでした。もう一度お試しください。"));
    }
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
    if (confirmDialog) return;
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
    // An IME composing "n" must not steal focus mid-word.
    if (event.isComposing) return;
    if (event.key === "n" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-new-note-input]")?.focus();
      return;
    }
    if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) =>
        visibleGraphs.length === 0 ? 0 : Math.min(prev + 1, visibleGraphs.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const graph = visibleGraphs[activeIndex];
      if (!graph) return;
      event.preventDefault();
      onOpen(graph.id);
      return;
    }
    // Plain Backspace is too easy to hit from the keyboard flow; the
    // modifier makes deletion deliberate, and the dialog still confirms it.
    if ((event.key === "Backspace" || event.key === "Delete") && (event.metaKey || event.ctrlKey)) {
      const graph = visibleGraphs[activeIndex];
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
    state: {
      graphs: visibleGraphs,
      totalGraphs: graphs.length,
      trash,
      title,
      query,
      sort,
      hits,
      searching,
      error,
      notice,
      loading,
      busy,
      activeIndex,
      renamingId,
      renameDraft,
      confirmDialog,
    },
    actions: {
      setTitle,
      setQuery,
      changeSort,
      setActiveIndex,
      onCreate,
      onDelete,
      onPurge,
      restoreGraph,
      loadTrash,
      hideTrash: () => setTrash(null),
      startRename,
      cancelRename,
      commitRename,
      setRenameDraft,
      onImportFile,
      dismissError: () => setError(null),
      dismissNotice: () => setNotice(null),
      openHit: (hit: SearchHit) => onOpen(hit.graph_id, hit.node_id),
    },
  };
}

export type GraphListController = ReturnType<typeof useGraphList>;
