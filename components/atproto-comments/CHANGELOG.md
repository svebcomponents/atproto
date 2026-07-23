# @svebcomponents/atproto.comments

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
