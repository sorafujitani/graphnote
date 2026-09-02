import type {
  ApiTokenMeta,
  ApiTokenAccess,
  BatchInput,
  BatchResult,
  CascadeResult,
  EdgeRecord,
  Graph,
  GraphDetail,
  GraphExport,
  GraphSummary,
  ImportResult,
  NodeRecord,
  PublicUser,
  QuotaUsage,
  SearchHit,
} from "../../shared/types";
import type { QUOTA } from "../../shared/quota";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 412 from a conditional node update: `current` is what the server holds now. */
export class ConflictError extends ApiError {
  current: NodeRecord;
  constructor(current: NodeRecord) {
    super(412, "conflict");
    this.current = current;
  }
}

export type ExportEntry = { name: string; size: number; uploaded: string; kind: "manual" | "auto" };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const timeout = AbortSignal.timeout(15_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      node?: NodeRecord;
    } | null;
    // A 401 means the session is gone; the app returns to the login screen
    // instead of leaving the user on an editor where nothing saves.
    if (res.status === 401 && path !== "/api/me") {
      window.dispatchEvent(new CustomEvent("graphnote:unauthorized"));
    }
    if (res.status === 412 && data?.node) throw new ConflictError(data.node);
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<{ authenticated: boolean; user: PublicUser }>("/api/me"),
  listGraphs: (scope: "live" | "trash" = "live") =>
    request<{ graphs: GraphSummary[] }>(scope === "trash" ? "/api/graphs?trash=1" : "/api/graphs"),
  search: (query: string, signal?: AbortSignal) =>
    request<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(query)}`, { signal }),
  quota: () => request<{ quota: typeof QUOTA; usage: QuotaUsage }>("/api/quota"),
  createGraph: (title: string) =>
    request<GraphDetail>("/api/graphs", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  importGraph: (payload: GraphExport) =>
    request<ImportResult>("/api/graphs/import", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  replaceGraph: (graphId: string, payload: GraphExport) =>
    request<ImportResult>(`/api/graphs/${graphId}/import`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createBatch: (graphId: string, input: BatchInput) =>
    request<BatchResult>(`/api/graphs/${graphId}/batch`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getGraph: (graphId: string) => request<GraphDetail>(`/api/graphs/${graphId}`),
  renameGraph: (graphId: string, title: string) =>
    request<{ graph: Graph }>(`/api/graphs/${graphId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteGraph: (graphId: string) =>
    request<{ ok: boolean }>(`/api/graphs/${graphId}`, { method: "DELETE" }),
  purgeGraph: (graphId: string) =>
    request<{ ok: boolean }>(`/api/graphs/${graphId}?purge=1`, { method: "DELETE" }),
  restoreGraph: (graphId: string) =>
    request<{ graph: Graph }>(`/api/graphs/${graphId}/restore`, { method: "POST" }),
  createNode: (graphId: string, input: { title?: string; body?: string; x?: number; y?: number }) =>
    request<{ node: NodeRecord }>(`/api/graphs/${graphId}/nodes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateNode: (
    graphId: string,
    nodeId: string,
    input: Partial<Pick<NodeRecord, "title" | "body" | "x" | "y" | "width" | "height">>,
    options: { ifMatch?: string } = {},
  ) =>
    request<{ node: NodeRecord }>(`/api/graphs/${graphId}/nodes/${nodeId}`, {
      method: "PATCH",
      headers: options.ifMatch ? { "If-Match": options.ifMatch } : undefined,
      body: JSON.stringify(input),
    }),
  restoreNodes: (graphId: string, nodeIds: string[], edgeIds: string[]) =>
    request<{ nodes: NodeRecord[]; edges: EdgeRecord[] }>(`/api/graphs/${graphId}/nodes/restore`, {
      method: "POST",
      body: JSON.stringify({ nodeIds, edgeIds }),
    }),
  deleteNodes: (graphId: string, ids: string[], cascade = false) =>
    request<{ deletedNodeIds: string[]; deletedEdgeIds: string[] }>(
      `/api/graphs/${graphId}/nodes/delete`,
      {
        method: "POST",
        body: JSON.stringify({ ids, cascade }),
      },
    ),
  createEdge: (graphId: string, input: { source_id: string; target_id: string; label?: string }) =>
    request<{ edge: EdgeRecord }>(`/api/graphs/${graphId}/edges`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateEdge: (graphId: string, edgeId: string, input: { label: string }) =>
    request<{ edge: EdgeRecord }>(`/api/graphs/${graphId}/edges/${edgeId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteEdge: (graphId: string, edgeId: string) =>
    request<{ ok: boolean }>(`/api/graphs/${graphId}/edges/${edgeId}`, {
      method: "DELETE",
    }),
  cascadeSelect: (graphId: string, nodeIds: string[], mode: "outgoing" | "both" = "outgoing") =>
    request<CascadeResult>(`/api/graphs/${graphId}/cascade-select`, {
      method: "POST",
      body: JSON.stringify({ nodeIds, mode }),
    }),
  formatGraph: (graphId: string) =>
    request<GraphDetail>(`/api/graphs/${graphId}/fmt`, { method: "POST" }),
  exportGraph: (graphId: string) =>
    request<{ export: GraphExport; r2Key: string }>(`/api/graphs/${graphId}/export`, {
      method: "POST",
    }),
  listExports: (graphId: string) =>
    request<{ exports: ExportEntry[] }>(`/api/graphs/${graphId}/exports`),
  getExport: (graphId: string, name: string) =>
    request<GraphExport>(`/api/graphs/${graphId}/exports/${encodeURIComponent(name)}`),
  listTokens: () => request<{ tokens: ApiTokenMeta[] }>("/api/tokens"),
  createToken: (name: string, access: ApiTokenAccess) =>
    request<{ token: string; meta: ApiTokenMeta }>("/api/tokens", {
      method: "POST",
      body: JSON.stringify({ name, access }),
    }),
  deleteToken: (tokenId: string) =>
    request<{ ok: boolean }>(`/api/tokens/${tokenId}`, { method: "DELETE" }),
  deleteAccount: () =>
    request<{ ok: boolean }>("/api/account", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
    }),
};
