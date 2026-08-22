import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only: pure functions and the shapes the API contract depends on.
// No browser or e2e harness - that is a bigger decision than this config, and
// rendering React would mean picking a DOM implementation and a testing
// library. What is here runs in plain Node and needs neither.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    // Matches the `@/*` path alias in tsconfig.json.
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
