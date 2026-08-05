ALTER TABLE api_tokens ADD COLUMN scopes TEXT NOT NULL DEFAULT 'graph:read graph:write graph:export';
ALTER TABLE api_tokens ADD COLUMN expires_at TEXT;

UPDATE api_tokens
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+90 days')
WHERE expires_at IS NULL;
