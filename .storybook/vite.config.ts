import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

// Keep the component sandbox independent of Cloudflare bindings and credentials.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss()],
});
