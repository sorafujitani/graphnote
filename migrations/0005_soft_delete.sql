ALTER TABLE graphs ADD COLUMN deleted_at TEXT;
ALTER TABLE nodes ADD COLUMN deleted_at TEXT;
ALTER TABLE edges ADD COLUMN deleted_at TEXT;

CREATE INDEX graphs_owner_deleted_idx ON graphs(owner_id, deleted_at);
CREATE INDEX nodes_graph_deleted_idx ON nodes(graph_id, deleted_at);
CREATE INDEX edges_graph_deleted_idx ON edges(graph_id, deleted_at);

-- The nightly purge scans only trashed rows.
CREATE INDEX graphs_trash_idx ON graphs(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX nodes_trash_idx ON nodes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX edges_trash_idx ON edges(deleted_at) WHERE deleted_at IS NOT NULL;
