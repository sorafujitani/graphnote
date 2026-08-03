import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["cli/gqn.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist/cli",
  outExtension: () => ({ js: ".js" }),
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
