import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// Sources only. `tsc` compiles the `*.test.ts` files into `dist/` alongside
// everything else, and vitest 4 no longer excludes `dist/**` by default, so
// without this every suite is discovered and run a second time as compiled
// JavaScript.
export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ["src/**/*.{test,spec}.ts"],
  },
});
