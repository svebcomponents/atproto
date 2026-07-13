import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import svebcomponents from "@svebcomponents/ssr/vite";

export default defineConfig({
  // Bind to 127.0.0.1 (not the default "localhost"): atproto's loopback OAuth
  // client requires a 127.0.0.1 redirect_uri, so the callback must resolve to
  // the same host the dev server listens on.
  server: { host: "127.0.0.1" },
  plugins: [
    // the SSR wrapper variant (sync/async) is auto-detected from svelte's
    // compilerOptions.experimental.async (enabled here for remote functions)
    svebcomponents(),
    sveltekit(),
  ],
});
