import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  compilerOptions: {
    // Required by @svebcomponents/ssr's async wrapper (svelte >=5.36 render()
    // results are thenable, so the sync SSR wrapper can no longer be used).
    experimental: { async: true },
  },

  kit: {
    // adapter-node: the app doubles as the hosted OAuth/posting service,
    // which needs a persistent Node process + disk (SQLite session store).
    adapter: adapter(),
  },
};

export default config;
