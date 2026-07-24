---
"@svebcomponents/atproto.comments": patch
---

Ship a Svelte-external build and route bundler consumers to it via the `svelte`
export condition, fixing a hydration crash (`Cannot read properties of null
(reading 'f')`) that wiped a correctly server-rendered thread on the client.

The client build bundled its own Svelte runtime. In a SvelteKit/Vite app —
which has its own Svelte — that put **two** Svelte runtimes on the page, and
under `experimental.async` the app's async-boundary hydration would cross into
the component's separate runtime and dereference a null effect. The component
now also emits `dist/client-svelte`/`dist/server-svelte` (Svelte marked
external), and its package `exports` declare a `svelte` condition pointing at
them, so bundlers dedupe the component onto the app's single Svelte runtime.
The default `dist/client` (Svelte bundled) is unchanged and still serves the
CDN / bare-`import` drop-in, which has no app Svelte to dedupe against.
