import { fileURLToPath } from "node:url";
import { defineConfig } from "@svebcomponents/build";

const hydrationHost = fileURLToPath(
  new URL("./src/HydrationHost.svelte", import.meta.url),
);

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
const configs = defineConfig({
  svelteOutDir: "dist/client-svelte",
  ssrSvelteOutDir: "dist/server-svelte",
});

// @svebcomponents/ssr's shipped HydrationHost destructures $props(). Under
// Svelte 5.56's async SSR that produces writable prop signals without a parent
// effect and hydration fails before the user's component mounts. Keep a local
// direct-props host, on *every* build variant (bundled + svelte-external, both
// halves of each side), until upstream ships the equivalent fix. Matching by
// outDir/entry rather than array index keeps this correct as the build's config
// ordering evolves.
for (const config of configs) {
  const outDir = typeof config.outDir === "string" ? config.outDir : "";
  // Client builds bundle the host: redirect its import to the local source.
  if (outDir === "dist/client" || outDir === "dist/client-svelte") {
    config.alias = {
      ...config.alias,
      "@svebcomponents/ssr/hydration-host": hydrationHost,
    };
  }
  // Server host builds compile the host itself: point them at the local source
  // so both sides stay byte-for-byte-equivalent.
  if (
    config.entry &&
    typeof config.entry === "object" &&
    "ssr-hydration-host" in config.entry
  ) {
    config.entry = { ...config.entry, "ssr-hydration-host": hydrationHost };
  }
}

export default configs;
