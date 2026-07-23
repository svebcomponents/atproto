---
"@svebcomponents/atproto.comments": patch
---

Rebuilt against `@svebcomponents/build` 0.3.1, whose client build bundles `@svebcomponents/ssr`'s `HydrationHost` instead of importing it as raw `.svelte` at runtime. Consuming SvelteKit apps no longer need a per-component `ssr.noExternal: ['@svebcomponents/atproto.comments']` entry for SSR — the `@svebcomponents/ssr/vite` plugin's own auto-`noExternal` now covers everything. No API or behavior change.
