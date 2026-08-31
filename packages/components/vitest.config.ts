import { defineConfig } from "vitest/config";

// Every test in this package is a component test: it renders into jsdom and
// asserts behaviour, aria, and axe-core cleanliness. Pure-function lanes live
// in the apps; this package IS components, so there is no node lane.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.tsx"],
  },
});
