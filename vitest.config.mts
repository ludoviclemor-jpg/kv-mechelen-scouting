import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Mirrors tsconfig.json's "@/*" -> "./src/*" path alias. Without this,
// any test file that transitively imports something under `@/` (even a
// plain JSON config file) fails to resolve under Vitest's own Vite-based
// resolver, which knows nothing about tsconfig `paths` on its own.
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
