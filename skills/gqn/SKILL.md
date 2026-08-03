---
name: gqn
description: >-
  Operate personal graphnote notes via the gqn CLI (graphs, markdown nodes, edges,
  cascade). Use when the user mentions graphnote, gqn, graph notes, or asks to
  create/read/update/delete notes or linked nodes. Prefer gqn over the web UI,
  browser automation, or raw curl.
---

# gqn — graphnote CLI

Use `gqn` for all graphnote API work. stdout is JSON. stderr may have human errors.

Auth is **Google OAuth in the browser** + **personal API tokens** for CLI/agents.

## Preconditions

```bash
command -v gqn >/dev/null || {
  REPO="$(ghq root)/github.com/sorafujitani/graphnote"
  (cd "$REPO" && pnpm install && pnpm build:cli)
  ln -sfn "$REPO/dist/cli/gqn.js" ~/.local/bin/gqn
  chmod +x "$REPO/dist/cli/gqn.js"
}
# Web UI: Continue with Google → API tokens → create token (shown once)
gqn config set-token "$GRAPHNOTE_TOKEN"   # or paste token; never echo in logs
gqn whoami
```

- **Default target: production** (`https://graphnote.app`)
- One-shot switch: `gqn --prod …` · `gqn --local …` · `gqn --url <url> …` (flags beat env/config)
- Config dirs: `~/.config/graphnote/` (prod) · `~/.config/graphnote-local/` (`--local`)
- Env: `GRAPHNOTE_URL`, `GRAPHNOTE_TOKEN`

## Commands

| Area    | Invocation                                                          |
| ------- | ------------------------------------------------------------------- |
| Health  | `gqn health`                                                        |
| Auth    | `gqn whoami` · `gqn logout` · `gqn config set-token`                |
| Config  | `gqn config show` · `set-url` · `set-token`                         |
| Graphs  | `gqn graphs list\|create\|get\|rename\|delete\|export\|import\|fmt` |
| Fmt     | `gqn fmt <graphId>` · `gqn graphs fmt <graphId>`                    |
| Nodes   | `gqn nodes create\|update\|delete`                                  |
| Edges   | `gqn edges create\|delete`                                          |
| Cascade | `gqn cascade <graphId> <nodeId...> [--mode outgoing\|both]`         |

Node `--body` is **Markdown** (stored as source text; UI renders GFM).

## Workflows

List:

```bash
gqn graphs list
```

Create graph (includes a root node) + linked child:

```bash
gqn graphs create 'Topic'
# → graph.id ; root node already created with the same title
gqn nodes create <graphId> --title 'Child' --parent <rootNodeId> --body '## Notes\n- item'
gqn graphs get <graphId>
```

Import / export:

```bash
gqn graphs export <graphId>
gqn graphs import ./note.json
```

Tidy tree layout (persist `x`/`y`; same as UI **Fmt** / `A`):

```bash
gqn fmt <graphId>
```

## Rules

1. Prefer `gqn` over browser automation / scraping / ad-hoc `curl`.
2. Parse JSON stdout; non-zero exit or `{"error":...}` is failure.
3. On `unauthorized`: obtain a new API token in the web UI, `gqn config set-token`, retry. Never print the token.
4. Destructive deletes only when the user explicitly asked.
5. After writes, confirm with `gqn graphs get <graphId>` or `gqn graphs list` when useful.
6. Outside the repo, assume production unless the user says local.
7. Graphs are per-user; you only see the authenticated account’s notes.
