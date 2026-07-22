import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  compilerOptions: {
    // required for the svebcomponents async SSR wrapper, which awaits the
    // component package's server prepare hook
    experimental: { async: true },
  },

  kit: {
    // adapter-node: the app doubles as the hosted OAuth/posting service,
    // which needs a persistent Node process + disk (SQLite session store).
    adapter: adapter(),
  },
};

export default config;
