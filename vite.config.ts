import babel from "@rolldown/plugin-babel";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "dist/**",
      "node_modules/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
      "pnpm-lock.yaml",
    ],
  },
  lint: {
    plugins: ["typescript", "react", "import", "unicorn"],
    categories: {
      correctness: "error",
      suspicious: "warn",
    },
    ignorePatterns: ["dist/**", "node_modules/**", ".wrangler/**", "worker-configuration.d.ts"],
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/rules-of-hooks": "error",
      "react/exhaustive-deps": "warn",
      "import/no-unassigned-import": "off",
      "typescript/no-explicit-any": "error",
      "typescript/no-floating-promises": "error",
      "typescript/no-misused-spread": "error",
      "typescript/no-unsafe-type-assertion": "off",
      "typescript/no-unnecessary-type-arguments": "off",
      "typescript/no-unnecessary-type-assertion": "off",
      "typescript/no-unnecessary-type-conversion": "off",
      "typescript/consistent-return": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/no-useless-fallback-in-spread": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  resolve: {
    // Vite 8 / rolldown: required so dep-pre-bundle resolve options are complete
    tsconfigPaths: true,
  },
  plugins: lazyPlugins(() => [
    tailwindcss(),
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    cloudflare(),
  ]),
});
