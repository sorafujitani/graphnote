# graphnote

Personal **graph notes** — ideas as nodes and edges, not long documents.

- **UI:** React Flow canvas (Markdown bodies, keyboard-first editing)
- **API:** Hono on Cloudflare Workers
- **Store:** D1 (`graphs` / `nodes` / `edges`) · export to JSON + R2
- **Auth:** shared password (cookie session)
- **CLI:** `gqn` · agent skills `gqn` / `gqn-teach` / `gqn-node-refactor`

Live: https://graphnote.fujitanisora0414.workers.dev

Deep links: `/g/<graphId>` opens that note (reload stays on the editor).

## Quick start

Requires **Node.js 26+**. Preferred: Nix flake + direnv.

```bash
direnv allow                 # Node 26 + pnpm + PATH=bin/gqn
pnpm install
cp .env.example .dev.vars    # set APP_PASSWORD / SESSION_SECRET
pnpm dev                     # http://127.0.0.1:5173
```

Without Nix: install Node 26+ (see `.node-version`) and pnpm 11, then the same `pnpm` steps.

Default local password in `.env.example`: `changeme`.

## Editor

Node **title** is the main label. **Body** is Markdown (GFM): click to edit source, blur / ⌘Enter to preview. Use short cues and official doc links in the body when that helps.

**Fmt** (toolbar or `A`) runs a left-to-right tidy tree layout and persists `x`/`y` (same as `gqn fmt`).

| Key          | Action                                               |
| ------------ | ---------------------------------------------------- |
| `F` / `↑↓←→` | Focus a parent (no mouse)                            |
| `Tab`        | Linked child from focused / hovered parent           |
| `N`          | Free (unlinked) node                                 |
| `Enter`      | Edit title → body                                    |
| `L`          | Link two selected nodes (or mark source then target) |
| `C`          | Cascade-select outgoing                              |
| `⌫` / `⇧⌫`   | Delete / cascade delete                              |
| `⇧↑↓←→`      | Nudge selection                                      |
| `A`          | Fmt — tidy tree layout                               |
| `⌘E`         | Export                                               |
| `⌘[`         | Back to notes list                                   |
| `Esc`        | Clear focus / cancel cascade / link                  |

## CLI (`gqn`)

```bash
pnpm build:cli
ln -sfn "$PWD/dist/cli/gqn.js" ~/.local/bin/gqn   # once
```

**Default target is production.** Override per invoke:

```bash
gqn graphs list                 # production
gqn --prod graphs list
gqn --local graphs list         # http://127.0.0.1:5173
gqn --url http://127.0.0.1:5173 whoami
```

|                 | Production                                       | Local (`--local`)            |
| --------------- | ------------------------------------------------ | ---------------------------- |
| URL             | `https://graphnote.fujitanisora0414.workers.dev` | `http://127.0.0.1:5173`      |
| Config / cookie | `~/.config/graphnote/`                           | `~/.config/graphnote-local/` |

In this repo with direnv, env points at local (`GRAPHNOTE_URL`, password from `.dev.vars`). Use `gqn --prod …` to hit production from the repo.

```bash
gqn login
gqn graphs list
gqn graphs create 'Topic'
gqn nodes create <graphId> --title 'Root' --x 120 --y 120
gqn nodes create <graphId> --title 'Child' --parent <rootId> --body '## note'
gqn fmt <graphId>               # tidy tree layout (also: gqn graphs fmt)
gqn graphs get <graphId>
```

Source: `cli/gqn.ts` · wrapper: `bin/gqn` · bundle: `dist/cli/gqn.js`.

### Agent skills

| Skill                                                           | Role                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`skills/gqn`](skills/gqn/SKILL.md)                             | Operate graphnote via `gqn`                                                                    |
| [`skills/gqn-teach`](skills/gqn-teach/SKILL.md)                 | URL / text → teach graph: abstract→concrete levels, compact bush, cues + official doc links    |
| [`skills/gqn-node-refactor`](skills/gqn-node-refactor/SKILL.md) | Rebalance layout / hierarchy when edges stretch or structure is wrong (prefer `gqn fmt` first) |

Linked into `~/.agents/skills/`, `~/.cursor/skills/`, and `.cursor/skills/`.

## Deploy

Build the client, then deploy (assets come from `vite build`):

```bash
pnpm exec vite build
pnpm run db:migrate:remote
pnpm exec wrangler deploy
# or: pnpm deploy   # migrate + wrangler (run vite build first)
```

Secrets on Workers: `APP_PASSWORD`, `SESSION_SECRET`.

## Toolchain

TypeScript 7 · Vite 8 + React Compiler · Vitest · Oxc (`oxlint` / `oxfmt`) · Knip · Lefthook · tsup (CLI)

```bash
pnpm typecheck
pnpm lint
pnpm fmt
pnpm test
pnpm check           # full gate
pnpm hooks:install   # once
```
