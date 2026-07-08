import { defineConfig } from "vitest/config";

// Unit tests only. The Playwright e2e suite (e2e/*.spec.ts) runs via
// `test:e2e` against the built adapter-node server, not vitest.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
  },
});
