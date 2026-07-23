---
"@svebcomponents/atproto.comments": patch
---

Adopt `@svebcomponents/ssr`/`@svebcomponents/build` 0.3.0's redesigned custom-element tag declaration: `AtprotoComments.svelte` now declares its tag with `<svelte:options customElement="atproto-comments" />` instead of the object form, and the package entrypoint no longer calls `defineElement` — Svelte's generated registration is guarded automatically by the build. No behavior change for consumers; the peer range on `@svebcomponents/ssr` is bumped to `^0.3.0`.
