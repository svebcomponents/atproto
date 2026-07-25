import { defineConfig } from "@svebcomponents/build";

// Emit the Svelte-external build variants (dist/client-svelte, dist/server-svelte)
// alongside the default Svelte-bundled build. A bundler consumer (SvelteKit,
// Vite) resolves the package's `svelte` export condition to these, so the
// component shares the host app's single Svelte runtime instead of bundling its
// own. Two runtimes in one page is what produces the
// "Cannot read properties of null (reading 'f')" crash when the app's
// async-boundary hydration (experimental.async) crosses into the component's
// separately-bundled runtime — svebcomponents/atproto#7. The default bundled
// build (dist/client) stays for the CDN / bare `import` drop-in, which has no
// app Svelte to dedupe against.
export default defineConfig({
  svelteOutDir: "dist/client-svelte",
  ssrSvelteOutDir: "dist/server-svelte",
});
