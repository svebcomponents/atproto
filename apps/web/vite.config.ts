import { defineConfig, type PluginOption } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import svebcomponents from "@svebcomponents/ssr/vite";

export default defineConfig({
  // Bind to 127.0.0.1 (not the default "localhost"): atproto's loopback OAuth
  // client requires a 127.0.0.1 redirect_uri, so the callback must resolve to
  // the same host the dev server listens on.
  server: { host: "127.0.0.1" },
  plugins: [
    // The SSR wrapper variant (sync/async) is auto-detected from svelte's
    // compilerOptions.experimental.async (enabled here for remote functions).
    // Cast needed only while @svebcomponents/ssr is consumed via the local
    // link: override: the linked checkout types against its own vite install,
    // and TS won't unify two installations even at the same version. Once the
    // package is consumed from npm, its `vite` peer dependency resolves to
    // this repo's vite and the cast can go.
    svebcomponents() as unknown as PluginOption,
    sveltekit(),
  ],
});
