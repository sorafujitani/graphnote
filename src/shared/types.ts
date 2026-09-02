export type Graph = {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

/** One row of the notes list: the graph plus live card / link counts. */
export type GraphSummary = Graph & {
  node_count: number;
  edge_count: number;
};

export type NodeRecord = {
  id: string;
  graph_id: string;
  title: string;
  body: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
};

export type EdgeRecord = {
  id: string;
  graph_id: string;
  source_id: string;
  target_id: string;
  label: string;
  created_at: string;
};

export type GraphDetail = {
  graph: Graph;
  nodes: NodeRecord[];
  edges: EdgeRecord[];
};

export type CascadeResult = {
  nodeIds: string[];
  edgeIds: string[];
};

export type GraphExport = {
  version: 1;
  exportedAt: string;
  graph: Graph;
  nodes: NodeRecord[];
  edges: EdgeRecord[];
};

/** What an import actually kept, so a lossy restore is never silent. */
export type ImportResult = GraphDetail & {
  skippedEdges: number;
};

type BatchNodeInput = {
  /** Client-side handle other batch items use to reference this node before it has an id. */
  tempId?: string;
  title?: string;
  body?: string;
  x?: number;
  y?: number;
};

type BatchEdgeInput = {
  /** Existing node id or a `tempId` from the same batch. */
  source: string;
  target: string;
  label?: string;
};

export type BatchInput = {
  nodes: BatchNodeInput[];
  edges: BatchEdgeInput[];
};

export type BatchResult = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  /** tempId → created node id. */
  ids: Record<string, string>;
};

export type SearchHit = {
  graph_id: string;
  graph_title: string;
  node_id: string;
  title: string;
  /** Body text around the first match, trimmed for a result list. */
  snippet: string;
};

export type QuotaUsage = {
  graphs: number;
  trashedGraphs: number;
  tokens: number;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type ApiTokenScope = "graph:read" | "graph:write" | "graph:export";
export type ApiTokenAccess = "read" | "write";

export type ApiTokenMeta = {
  id: string;
  name: string;
  scopes: ApiTokenScope[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};
