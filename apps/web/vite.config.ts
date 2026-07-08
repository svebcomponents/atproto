import { defineConfig, type PluginOption } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import svebcomponents from "@svebcomponents/ssr/vite";

export default defineConfig({
  // Bind to 127.0.0.1 (not the default "localhost"): atproto's loopback OAuth
  // client requires a 127.0.0.1 redirect_uri, so the callback must resolve to
  // the same host the dev server listens on.
  server: { host: "127.0.0.1" },
  plugins: [
    // Cast needed only while @svebcomponents/ssr is consumed via the local
    // link: override (its Plugin type resolves against that checkout's vite
    // copy). Remove together with the override in pnpm-workspace.yaml.
    svebcomponents() as unknown as PluginOption,
    sveltekit(),
  ],
});
