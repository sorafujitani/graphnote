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

## Preconditions

```bash
command -v gqn >/dev/null || {
  REPO="$(ghq root)/github.com/sorafujitani/graphnote"
  (cd "$REPO" && pnpm install && pnpm build:cli)
  ln -sfn "$REPO/dist/cli/gqn.js" ~/.local/bin/gqn
  chmod +x "$REPO/dist/cli/gqn.js"
}
gqn whoami   # if unauthorized → gqn login (password from env/config; never echo it)
```

- **Default target: production** (`https://graphnote.fujitanisora0414.workers.dev`)
- One-shot switch: `gqn --prod …` · `gqn --local …` · `gqn --url <url> …` (flags beat env/config)
- Config dirs: `~/.config/graphnote/` (prod) · `~/.config/graphnote-local/` (`--local`)
- In the graphnote repo with direnv, env points at local; use `gqn --prod` to hit production from there

## Commands

| Area    | Invocation                                                  |
| ------- | ----------------------------------------------------------- |
| Health  | `gqn health`                                                |
| Auth    | `gqn login` · `gqn logout` · `gqn whoami`                   |
| Config  | `gqn config show` · `set-url` · `set-password`              |
| Graphs  | `gqn graphs list\|create\|get\|rename\|delete\|export\|fmt` |
| Fmt     | `gqn fmt <graphId>` · `gqn graphs fmt <graphId>`            |
| Nodes   | `gqn nodes create\|update\|delete`                          |
| Edges   | `gqn edges create\|delete`                                  |
| Cascade | `gqn cascade <graphId> <nodeId...> [--mode outgoing\|both]` |

Node `--body` is **Markdown** (stored as source text; UI renders GFM).

## Workflows

List:

```bash
gqn graphs list
```

Create graph + root + linked child:

```bash
gqn graphs create 'Topic'
gqn nodes create <graphId> --title 'Root' --x 120 --y 120
gqn nodes create <graphId> --title 'Child' --parent <rootNodeId> --body '## Notes\n- item'
gqn graphs get <graphId>
```

Update / delete:

```bash
gqn nodes update <graphId> <nodeId> --title 'New' --body '**bold**'
gqn nodes delete <graphId> <nodeId> --cascade   # only if user asked
gqn graphs delete <graphId>                     # only if user asked
```

Tidy tree layout (persist `x`/`y`; same as UI **Fmt** / `A`):

```bash
gqn fmt <graphId>
```

## Rules

1. Prefer `gqn` over browser automation / scraping / ad-hoc `curl`.
2. Parse JSON stdout; non-zero exit or `{"error":...}` is failure.
3. On `unauthorized`: `gqn login` once (config/env password), then retry. Never print the password.
4. Destructive deletes only when the user explicitly asked.
5. After writes, confirm with `gqn graphs get <graphId>` or `gqn graphs list` when useful.
6. Outside the repo, assume production unless the user says local.
