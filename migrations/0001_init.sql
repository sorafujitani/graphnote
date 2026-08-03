CREATE TABLE graphs (
	id TEXT PRIMARY KEY NOT NULL,
	title TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE nodes (
	id TEXT PRIMARY KEY NOT NULL,
	graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
	title TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL DEFAULT '',
	x REAL NOT NULL DEFAULT 0,
	y REAL NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX nodes_graph_id_idx ON nodes(graph_id);

CREATE TABLE edges (
	id TEXT PRIMARY KEY NOT NULL,
	graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
	source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
	target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
	label TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	UNIQUE(graph_id, source_id, target_id)
);

CREATE INDEX edges_graph_id_idx ON edges(graph_id);
CREATE INDEX edges_source_id_idx ON edges(source_id);
CREATE INDEX edges_target_id_idx ON edges(target_id);
