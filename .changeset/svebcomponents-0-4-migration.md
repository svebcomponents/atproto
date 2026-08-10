---
"@svebcomponents/atproto.comments": minor
---

Adopt svebcomponents 0.4: the component is the package entry, and the build now
ships a custom elements manifest and element types.

`@svebcomponents/build` 0.4.0 infers a component entry from the same-basename
`.svelte` source, so `src/index.ts` — which only re-exported the component — is
gone and `src/AtprotoComments.svelte` is now `src/index.svelte`. The published
entrypoint (`dist/client/index.js`, and the jsDelivr default) is unchanged, so
CDN and npm consumers need no changes.

What is new for consumers:

- **`custom-elements.json`** (custom elements manifest 2.1.0) is emitted and
  published, wired up through the `customElements` field. Editors read it for
  HTML completions on `<atproto-comments>`.
- **Element types** are appended to `dist/client/index.d.ts`. Importing the
  package now puts `atproto-comments` in `HTMLElementTagNameMap`, narrows
  `addEventListener`, and exports `AtprotoCommentsElement`,
  `AtprotoCommentsAttributes`, `AtprotoCommentsEventMap` and
  `AtprotoCommentsEventHandlers` for registering the element with a host
  framework's template types.
- **The seven `atproto-comments:*` events are documented** on the component, so
  they reach both the manifest and the event map. They are dispatched through
  one shared helper that the build's source scan cannot narrow, so each
  `detail` is typed `unknown`; the shapes are in the README.
- **`@svebcomponents/atproto.client` moved to `dependencies`.** The generated
  declarations reference `CommentTree` and `CommentSort` from it, so a consumer
  type-checking with `skipLibCheck: false` could not resolve them while it was
  a devDependency. The runtime bundle still inlines it.
- **The `@svebcomponents/utils` dependency is dropped.** It was never imported
  here — `@svebcomponents/build` uses it at build time — and 0.3.0 removes
  `defineElement`, its last consumer-facing export.

The `@svebcomponents/ssr` peer range moves to `^0.5.0`. That release resolves a
component's tag from a direct `.svelte` entry, which is what keeps the generated
renderer self-registering now that the entry module is gone — hosts still only
need `import "@svebcomponents/atproto.comments/ssr"`.
