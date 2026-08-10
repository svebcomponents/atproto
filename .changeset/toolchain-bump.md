---
"@svebcomponents/atproto.comments": patch
---

Rebuild against the toolchain svebcomponents itself is tested on: Svelte
5.56.8, Vite 8, `@sveltejs/vite-plugin-svelte` 7, Vitest 4, and tsdown 0.22.14.

Pinning tsdown matters: `@svebcomponents/build` declares it as a peer
dependency with an open `>=0.15.0` range, and with `auto-install-peers` pnpm
resolved the bottom of that range. tsdown 0.15 ignores the `deps.alwaysBundle`
rules the build relies on, which left bare `@svebcomponents/ssr/hydration`
specifiers in `dist/client/index.js` — the CDN drop-in, which a browser loads
with no import map.

This matters to consumers of the `svelte` conditional export, which shares the
host application's Svelte runtime and is therefore coupled to the version this
package was compiled with. Applications selecting that condition should be on
Svelte 5.56.8 or a compatible release; everyone else resolves the standalone
`default` build, which bundles its own runtime and is unaffected.
