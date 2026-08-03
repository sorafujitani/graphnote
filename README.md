# graphnote

Personal graph notes on Cloudflare Workers.

- **Store:** D1 (`graphs` / `nodes` / `edges`)
- **Export:** JSON download + R2 snapshot
- **Auth:** shared password (cookie session)

## Setup

Requires **Node.js 26+**. Preferred: Nix flake + direnv (`flake.nix` / `.envrc`).

```bash
direnv allow          # enters flake devShell (Node 26 + pnpm)
pnpm install
cp .env.example .dev.vars   # edit APP_PASSWORD / SESSION_SECRET
pnpm dev
```

Without Nix: use Node 26+ (see `.node-version`) and pnpm 11.

Default password: `changeme`.

## Toolchain

- TypeScript 7 (`tsc`)
- Vite 8 + React Compiler (`@rolldown/plugin-babel` + `babel-plugin-react-compiler`)
- Vitest 4 + happy-dom + Testing Library + coverage
- Oxc: `oxlint` / `oxfmt` (+ `oxlint-tsgolint`)
- Knip (unused exports/deps)
- Lefthook (optional git hooks)
- CLI bundle: `tsup`

```bash
pnpm typecheck
pnpm lint
pnpm fmt
pnpm knip
pnpm test
pnpm test:coverage
pnpm check
pnpm hooks:install   # once, for lefthook
```

## Keyboard (editor)

- `F` or `↑↓←→` — focus a parent (no mouse needed)
- `Tab` — create a **linked** child from the focused/hovered parent
- `N` — create a free (unlinked) node
- `Enter` — edit title

## Deploy

```bash
pnpm build
pnpm deploy   # remote D1 migrate + wrangler deploy
```

## Agent CLI

```bash
pnpm build:cli          # bundles cli/graphnote.ts → dist/cli/graphnote.js
pnpm graphnote help     # runs TypeScript via tsx (dev)
ln -sfn "$PWD/dist/cli/graphnote.js" ~/.local/bin/graphnote
graphnote login
graphnote graphs list
```

Source: `cli/graphnote.ts`. Bin: `dist/cli/graphnote.js` (tsup).

Config: `GRAPHNOTE_URL` / `GRAPHNOTE_PASSWORD` or `~/.config/graphnote/`.  
Agent skill: `graphnote-cli` (`~/.agents/skills/graphnote-cli`).
