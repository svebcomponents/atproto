import { fileURLToPath } from "node:url";
import { defineConfig } from "@svebcomponents/build";

const configs = defineConfig();
const hydrationHost = fileURLToPath(
  new URL("./src/HydrationHost.svelte", import.meta.url),
);

// @svebcomponents/ssr 0.3.0's shipped HydrationHost destructures $props().
// Under Svelte 5.56's async SSR integration that produces writable prop
// signals without a parent effect and hydration fails before the user's
// component mounts. Keep the host local until that upstream package includes
// the equivalent direct-props fix.
configs[0] = {
  ...configs[0],
  alias: {
    ...configs[0].alias,
    "@svebcomponents/ssr/hydration-host": hydrationHost,
  },
  noExternal: [
    ...(configs[0].noExternal ?? []),
    /@svebcomponents\/ssr\/hydration/,
  ],
};

// Hydration requires byte-for-byte-equivalent host structure on both sides.
// Point the generated server host at the same local source as the client.
configs[2] = {
  ...configs[2],
  entry: { "ssr-hydration-host": hydrationHost },
};

export default configs;
