---
"@svebcomponents/atproto.comments": patch
---

Rebuild against the toolchain svebcomponents itself is tested on: Svelte
5.56.8, Vite 8, `@sveltejs/vite-plugin-svelte` 7 and Vitest 4.

This matters to consumers of the `svelte` conditional export, which shares the
host application's Svelte runtime and is therefore coupled to the version this
package was compiled with. Applications selecting that condition should be on
Svelte 5.56.8 or a compatible release; everyone else resolves the standalone
`default` build, which bundles its own runtime and is unaffected.
