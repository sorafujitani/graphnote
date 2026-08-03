-- Destructive: wipe app data and add per-user ownership + Better Auth tables.
DELETE FROM edges;
DELETE FROM nodes;
DELETE FROM graphs;

DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS graphs;

CREATE TABLE graphs (
	id TEXT PRIMARY KEY NOT NULL,
	owner_id TEXT NOT NULL,
	title TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX graphs_owner_id_idx ON graphs(owner_id);

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

-- Better Auth core schema (SQLite / D1)
CREATE TABLE IF NOT EXISTS user (
	id TEXT NOT NULL PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	emailVerified INTEGER NOT NULL,
	image TEXT,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
	id TEXT NOT NULL PRIMARY KEY,
	expiresAt TEXT NOT NULL,
	token TEXT NOT NULL UNIQUE,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL,
	ipAddress TEXT,
	userAgent TEXT,
	userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);

CREATE TABLE IF NOT EXISTS account (
	id TEXT NOT NULL PRIMARY KEY,
	accountId TEXT NOT NULL,
	providerId TEXT NOT NULL,
	userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
	accessToken TEXT,
	refreshToken TEXT,
	idToken TEXT,
	accessTokenExpiresAt TEXT,
	refreshTokenExpiresAt TEXT,
	scope TEXT,
	password TEXT,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
	id TEXT NOT NULL PRIMARY KEY,
	identifier TEXT NOT NULL,
	value TEXT NOT NULL,
	expiresAt TEXT NOT NULL,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

CREATE TABLE IF NOT EXISTS api_tokens (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens(user_id);

CREATE TABLE IF NOT EXISTS rate_limits (
	key TEXT PRIMARY KEY NOT NULL,
	count INTEGER NOT NULL DEFAULT 0,
	window_start INTEGER NOT NULL
);
