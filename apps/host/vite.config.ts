import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import svebcomponents from "@svebcomponents/ssr/vite";

export default defineConfig({
  // Bind to 127.0.0.1 (not the default "localhost"): atproto's loopback OAuth
  // client requires a 127.0.0.1 redirect_uri, so the callback must resolve to
  // the same host the dev server listens on.
  server: { host: "127.0.0.1" },
  // Keep the server-only DOM shim outside the app bundle. The component's
  // guarded client entry dynamically imports this subpath during SSR; bundling
  // it into the same async server graph creates a top-level-await cycle.
  ssr: { external: ["@svebcomponents/ssr/shim"] },
  plugins: [
    // The page server-load supplies threadData, so rendering stays synchronous
    // while still producing a fully server-rendered declarative shadow root.
    svebcomponents({ async: false }),
    sveltekit(),
  ],
});
