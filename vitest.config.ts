import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "cli/**/*.test.ts"],
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/worker/**/*.ts", "src/shared/**/*.ts", "src/react-app/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/env.ts"],
    },
  },
});
