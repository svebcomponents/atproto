---
"@svebcomponents/atproto.comments": minor
---

Adopt svebcomponents 0.5: the component is the package entry, and the build now
ships a custom elements manifest, element types and Svelte template types.

`@svebcomponents/build` infers a component entry from the same-basename
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
  a devDependency. The browser build inlines it regardless, so
  `dist/client/index.js` remains the self-contained CDN drop-in it was
  (27.5 kB gzipped).
- **The `@svebcomponents/utils` dependency is dropped.** It was never imported
  here — `@svebcomponents/build` uses it at build time — and 0.3.0 removes
  `defineElement`, its last consumer-facing export.
- **Svelte template types** ship as a new `./svelte` export. Svelte consumers
  opt in with one line in a `.d.ts` and get `<atproto-comments>` checked like
  any other element:

  ```ts
  import "@svebcomponents/atproto.comments/svelte";
  ```

  They are opt-in rather than automatic because this package deliberately does
  not declare `svelte` — it has to stay usable from a plain HTML page.

  `threadData` is passed as a property (`threadData={tree}`), which is how the
  types describe it; the `thread-data` attribute is a string, since an
  attribute cannot carry a `CommentTree`.

The `@svebcomponents/ssr` peer range moves to `^0.7.0`. It resolves a
component's tag from a direct `.svelte` entry, which is what keeps the generated
renderer self-registering now that the entry module is gone — hosts still only
need `import "@svebcomponents/atproto.comments/ssr"`.

**The `svelte` export condition is gone.** The package used to ship a second,
Svelte-flavoured build of the same component behind that condition; a bundler
resolving `svelte` picked it up and pulled Svelte into the host's graph. Every
consumer now loads the one compiled custom element, whatever their bundler
resolves — a Svelte host included. Nothing to change on your side: the import
specifiers are the same, and the element behaves the same. Only the `types` and
`default` conditions remain, which is what `@svebcomponents/build` 0.7.0
supports.
