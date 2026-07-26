# @svebcomponents/atproto.comments

## 0.2.1

### Patch Changes

- a8212eb: Ship a Svelte-external build and route bundler consumers to it via the `svelte`
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

## 0.2.0

### Minor Changes

- 10bf336: Make the hosted auth and live-update backend the component default. Add a
  public SSE endpoint backed by one multiplexed Microcosm Spacedust connection,
  event-driven thread revalidation, and same-origin cookie sessions for
  self-hosters.

### Patch Changes

- 2426db4: Require `@svebcomponents/ssr` 0.3.1 or newer for SSR consumers. This runtime recognizes component renderers across the bundled and external module instances that Vite can create, allowing SvelteKit apps to use the component without a package-specific `ssr.noExternal` entry.

## 0.1.2

### Patch Changes

- fa00081: Rebuilt against `@svebcomponents/build` 0.3.1, whose client build bundles `@svebcomponents/ssr`'s `HydrationHost` instead of importing it as raw `.svelte` at runtime. This removes the raw-`.svelte` reason for a per-component `ssr.noExternal` entry. With `@svebcomponents/ssr` 0.3.1 or newer, which also recognizes renderers across bundled and external module instances, consuming SvelteKit apps can remove `ssr.noExternal: ['@svebcomponents/atproto.comments']` entirely. No API or behavior change.

## 0.1.1

### Patch Changes

- 9d059ac: Adopt `@svebcomponents/ssr`/`@svebcomponents/build` 0.3.0's redesigned custom-element tag declaration: `AtprotoComments.svelte` now declares its tag with `<svelte:options customElement="atproto-comments" />` instead of the object form, and the package entrypoint no longer calls `defineElement` — Svelte's generated registration is guarded automatically by the build. No behavior change for consumers; the peer range on `@svebcomponents/ssr` is bumped to `^0.3.0`.

## 0.1.0

### Minor Changes

- 56c9841: Publish the initial ATProto comments packages, including component-owned
  server fetching and serialized hydration through svebcomponents SSR.
