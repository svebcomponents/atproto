import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    ssr: "src/index.ts",
    rollupOptions: {
      external: [
        /^@atproto\//,
        /^@svebcomponents\/atproto\.client(?:\/|$)/,
        /^jose(?:\/|$)/,
      ],
      output: { entryFileNames: "index.js" },
    },
  },
  // The bridge remains framework-agnostic for consumers: its server-side
  // Svelte renderer is an implementation detail bundled into the package.
  ssr: { noExternal: ["svelte"] },
});
