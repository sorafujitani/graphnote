/**
 * Publishes the CLI bundle as a static asset of the site, so
 * `curl -fsSL https://graphnote.app/install.sh | sh` needs no npm, no registry
 * and no release pipeline.
 *
 * Runs after `vite build` (which empties dist/client) and before deploy.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliBundle = join(root, "dist", "cli", "gqn.js");
const clientDir = join(root, "dist", "client");
const installDir = join(clientDir, "install");

if (!existsSync(cliBundle))
  throw new Error(`missing ${cliBundle} — run 'pnpm run build:cli' first`);
if (!existsSync(clientDir)) throw new Error(`missing ${clientDir} — run 'vp build' first`);

// Rebuild from scratch so nothing stale is served.
rmSync(installDir, { recursive: true, force: true });
mkdirSync(installDir, { recursive: true });
// `.mjs`: the standalone install has no package.json, so `.js` would load as CJS.
cpSync(cliBundle, join(installDir, "gqn.mjs"));
cpSync(join(root, "packaging", "install.sh"), join(clientDir, "install.sh"));

process.stdout.write("install assets: dist/client/install/gqn.mjs + install.sh\n");
