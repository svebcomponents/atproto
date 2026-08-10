import { defineConfig } from "@svebcomponents/build";

/**
 * `@svebcomponents/atproto.client` has to be both a real dependency and
 * bundled, which package.json alone cannot express.
 *
 * It is a `dependency` because the element declarations this package publishes
 * name `CommentTree` and `CommentSort` from it. A consumer type-checking with
 * `skipLibCheck: false` cannot resolve those unless the package is installed.
 *
 * It also has to be inlined: `dist/client/index.js` is the CDN drop-in, loaded
 * straight from a `<script type="module">` with no import map, so a surviving
 * bare specifier would stop the element registering at all. tsdown externalizes
 * `dependencies` by default, so it is named here instead.
 *
 * This is the only reason the package needs an explicit config rather than
 * export inference; the entries below mirror `package.json`'s `exports`.
 */
const alwaysBundle = [/^@svebcomponents\/atproto\.client$/];

export default defineConfig({
  entry: "src/index.svelte",
  outDir: "dist/client",
  svelteOutDir: "dist/client-svelte",
  ssr: true,
  ssrOutDir: "dist/server",
  ssrSvelteOutDir: "dist/server-svelte",
}).map((config) => ({
  ...config,
  deps: {
    ...config.deps,
    alwaysBundle: [...(config.deps?.alwaysBundle ?? []), ...alwaysBundle],
  },
}));
