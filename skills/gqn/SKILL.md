---
name: graphnote-cli
description: Use when reading or writing graphnote notes/graphs/nodes/edges via the graphnote CLI (Cloudflare-hosted personal graph notes). Prefer the CLI over scraping the web UI.
---

# Graphnote CLI

Use `graphnote` for all graphnote API work. Output is JSON.

## Setup (once per machine)

```bash
# binary on PATH (repo checkout)
REPO="$(ghq root)/github.com/sorafujitani/graphnote"
(cd "$REPO" && pnpm install && pnpm build:cli)
ln -sfn "$REPO/dist/cli/graphnote.js" ~/.local/bin/graphnote
chmod +x "$REPO/dist/cli/graphnote.js"

graphnote config set-url https://graphnote.fujitanisora0414.workers.dev
graphnote config set-password '<password>'   # or export GRAPHNOTE_PASSWORD
graphnote login
graphnote whoami
```

Env overrides: `GRAPHNOTE_URL`, `GRAPHNOTE_PASSWORD`, `GRAPHNOTE_CONFIG_DIR`.

## Commands

- Health: `graphnote health`
- Auth: `graphnote login` · `graphnote logout` · `graphnote whoami`
- Graphs: `graphnote graphs list|create|get|rename|delete|export`
- Nodes: `graphnote nodes create|update|delete`
- Edges: `graphnote edges create|delete`
- Cascade: `graphnote cascade <graphId> <nodeId...> [--mode outgoing|both]`

## Common workflows

List notes:

```bash
graphnote graphs list
```

Create a note with a root node and linked child:

```bash
graphnote graphs create 'Topic'
# take graph.id from JSON
graphnote nodes create <graphId> --title 'Root' --x 120 --y 120
# take node.id
graphnote nodes create <graphId> --title 'Child' --parent <rootNodeId> --body '...'
graphnote graphs get <graphId>
```

Update / delete:

```bash
graphnote nodes update <graphId> <nodeId> --title 'New title' --body '...'
graphnote nodes delete <graphId> <nodeId> --cascade
graphnote graphs delete <graphId>
```

## Rules

1. Prefer `graphnote` over browser automation or raw `curl`.
2. Parse JSON stdout; treat non-zero exit + `{"error":...}` as failure.
3. On `unauthorized`, run `graphnote login` (password from config/env) and retry once.
4. Do not print the password in chat logs. Use config/env.
5. Destructive deletes (`graphs delete`, `nodes delete --cascade`) only when the user asked.
6. Default remote is production Workers; for local API use  
   `graphnote config set-url http://127.0.0.1:5173` then `graphnote login`.
