import { defineConfig } from "@playwright/test";

// Serves the adapter-node output — run `pnpm build` (repo root) first so the
// component and server bundles are current.
export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:45871",
  },
  webServer: {
    command: "node build/index.js",
    url: "http://localhost:45871",
    env: { PORT: "45871" },
    reuseExistingServer: false,
  },
});
