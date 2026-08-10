import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic: layout math, worker rules, keyboard helpers.
        test: {
          name: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "cli/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.tsx"],
          environment: "happy-dom",
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      {
        // Canvas behaviour: real layout, real hit testing, real pointer events.
        // happy-dom reports zero-sized boxes, so these belong in a browser.
        plugins: [tailwindcss(), react()],
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            viewport: { width: 1280, height: 900 },
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/worker/**/*.ts",
        "src/shared/**/*.ts",
        "src/react-app/lib/**/*.ts",
        "src/react-app/logic/**/*.ts",
        "cli/args.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/env.ts"],
      // Ratchet: measured floor at the time thresholds were added. Raise as
      // coverage grows; never lower without a reason in the commit message.
      thresholds: {
        statements: 52,
        branches: 42,
        functions: 58,
        lines: 55,
      },
    },
  },
});
