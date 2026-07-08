import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  compilerOptions: {
    // required for `await`ing remote functions in components, and for the
    // svebcomponents async SSR wrapper
    experimental: { async: true },
  },

  kit: {
    // adapter-node: the app doubles as the hosted OAuth/posting service,
    // which needs a persistent Node process + disk (SQLite session store).
    adapter: adapter(),
    experimental: {
      // server data via `query`/`command` remote functions (.remote.ts)
      remoteFunctions: true,
    },
  },
};

export default config;
