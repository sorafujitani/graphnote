import type {
  ApiTokenMeta,
  ApiTokenAccess,
  CascadeResult,
  EdgeRecord,
  Graph,
  GraphDetail,
  GraphExport,
  NodeRecord,
  PublicUser,
} from "../../shared/types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    // A 401 means the session is gone; the app returns to the login screen
    // instead of leaving the user on an editor where nothing saves.
    if (res.status === 401 && path !== "/api/me") {
      window.dispatchEvent(new CustomEvent("graphnote:unauthorized"));
    }
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<{ authenticated: boolean; user: PublicUser }>("/api/me"),
  listGraphs: () => request<{ graphs: Graph[] }>("/api/graphs"),
  createGraph: (title: string) =>
    request<GraphDetail>("/api/graphs", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  importGraph: (payload: GraphExport) =>
    request<GraphDetail>("/api/graphs/import", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getGraph: (graphId: string) => request<GraphDetail>(`/api/graphs/${graphId}`),
  renameGraph: (graphId: string, title: string) =>
    request<{ graph: Graph }>(`/api/graphs/${graphId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteGraph: (graphId: string) =>
    request<{ ok: boolean }>(`/api/graphs/${graphId}`, { method: "DELETE" }),
  createNode: (graphId: string, input: { title?: string; body?: string; x?: number; y?: number }) =>
    request<{ node: NodeRecord }>(`/api/graphs/${graphId}/nodes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateNode: (
    graphId: string,
    nodeId: string,
    input: Partial<Pick<NodeRecord, "title" | "body" | "x" | "y" | "width" | "height">>,
  ) =>
    request<{ node: NodeRecord }>(`/api/graphs/${graphId}/nodes/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
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
