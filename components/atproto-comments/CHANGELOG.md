# @svebcomponents/atproto.comments

## 0.6.0

### Minor Changes

- 4100880: Fresh-by-default snapshots: "not live" no longer means "stale".

  A component mounted with a preloaded `threadData` snapshot used to render it
  indefinitely unless the viewer signed in and the live stream connected. The
  component now runs one background revalidation against the public AppView on
  mount when the snapshot is older than the new `stale-time` attribute
  (default 60 000 ms; `Infinity` opts out). The refresh is a direct client →
  AppView read: signed-out visitors get current comments while still making no
  request to any bridge.

  The SSR prefetch stamps the new `fetched-at` property automatically so real-time
  server rendering skips the redundant fetch. Hosts supplying their own
  `threadData` can pass `fetched-at` too; leaving it out counts as an unknown age,
  which is treated as stale — fresh content by default.

- 13cde70: New `viewer-name` property: what outbound links call the viewer.

  Link text ("Reply on …", "Continue this thread on …") previously used the
  literal "Bluesky" for the default viewer and the bare hostname for anything
  else, so a self-hosted frontend got "Reply on comments.example.com" with no
  way to name it. Set `viewer-name="Deer"` alongside `viewer` to override.

  Defaults are unchanged: "Bluesky" when `viewer` is unset, the viewer's
  hostname otherwise.

### Patch Changes

- Updated dependencies [13cde70]
  - @svebcomponents/atproto.client@0.5.0

## 0.5.0

### Minor Changes

- 9fde04a: Move the `@svebcomponents/ssr` peer range to `^0.8.0`, the runtime this package
  is now built and tested against.

  0.8.0 removes the `@svebcomponents/ssr/enable-async` entry point that hosts had
  to import by hand to turn on Svelte's async server runtime. A component package
  built with `compilerOptions.experimental.async` now enables it from its own
  generated `/ssr` entry. This component renders synchronously — its SSR
  preparation hook returns early when the host supplies `threadData` — so its
  generated renderer is unchanged from the one 0.7 produced and consumers have
  nothing to change beyond the peer bump.

  If your host imports `@svebcomponents/ssr/enable-async` for some other
  component, delete the import and rebuild that package.

- 79d6687: Security and reader-privacy hardening ahead of the first announced release.

  **Session handoff is bound to the origin it was authorized for.** The sign-in
  claim nonce travels as a query parameter on a public endpoint, so it could
  never be the secret that guarded the handoff. Claims now record the origin the
  sign-in was authorized for and are only released to a matching `Origin`.

  **Requests that write to a repo require a proven origin.** A missing `Origin`
  header previously skipped the origin check entirely, so origin-bound tokens
  were unbound for any client that simply omitted the header. All mutating
  requests now require one, in both session modes.

  **Link facets are scheme-checked before becoming an `href`.** Facets are
  self-asserted and returned verbatim by the AppView, so a link facet could
  carry a `javascript:` URI and execute on the embedding page. Only `http:` and
  `https:` become links; anything else renders as plain text.

  **Signing out revokes the ATProto grant**, not just the browser session, and
  unused token sets now expire (30 days) instead of being kept forever.

  **Signed-out readers no longer contact the bridge.** The live event stream is
  gated behind the new `live` attribute (`"signed-in"` by default, plus `"all"`
  and `"off"`), and the session probe only runs when there is a session to
  restore. A reader who never signs in now makes no request to the service at
  all. Set `live="all"` to restore streaming for every reader.

  **New `allowedOrigins` service option** restricts which sites may sign in
  against a deployment. Defaults to allowing any origin, as the hosted instance
  needs.

  Also: `return` URLs are reduced to origin + path — enforced on the server, so
  it also covers the `Referer` fallback — meaning reader query strings never
  reach the service; the no-JS sign-in link carries `referrerpolicy="origin"`;
  and a `state` field labelled as a CSRF nonce that was never verified has been
  removed (the OAuth library owns that check).

### Patch Changes

- Updated dependencies [79d6687]
  - @svebcomponents/atproto.client@0.4.0

## 0.4.0

### Minor Changes

- 000cd2a: Adopt svebcomponents 0.5: the component is the package entry, and the build now
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

### Patch Changes

- 000cd2a: Rebuild against the toolchain svebcomponents itself is tested on: Svelte
  5.56.8, Vite 8, `@sveltejs/vite-plugin-svelte` 7 and Vitest 4.

  This matters to consumers of the `svelte` conditional export, which shares the
  host application's Svelte runtime and is therefore coupled to the version this
  package was compiled with. Applications selecting that condition should be on
  Svelte 5.56.8 or a compatible release; everyone else resolves the standalone
  `default` build, which bundles its own runtime and is unaffected.

## 0.3.0

### Minor Changes

- 4e7e915: Add progressively enhanced reply, like, and repost controls that remain
  functional without client-side JavaScript when the component uses a
  same-origin, cookie-mode service.

  The new `pageUrl` property supplies the embedding page's canonical URL so a
  no-JavaScript sign-in flow can return to the page after authentication. Reply,
  like, and repost actions use native HTML forms as their baseline while
  retaining the existing client-enhanced experience when JavaScript is
  available.

  This corrective release documents functionality that was included in 0.2.2
  without a corresponding Changeset.

## 0.2.2

### Patch Changes

- 6b1769a: Ship a Svelte-external build and route bundler consumers to it via the `svelte`
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

- 6b1769a: Shrink the CDN / bare-`import` client bundle by 13% (93.6 kB → 81.3 kB raw,
  31.8 kB → 27.8 kB gzipped) by no longer shipping Svelte's dev-only code.

  The build resolved `esm-env`'s `DEV` export through its `dev-fallback` — a
  runtime `process.env.NODE_ENV` check rather than a literal — so no `if (DEV)`
  branch in Svelte's runtime could be eliminated, and the full dev-only error and
  warning message texts ended up in `dist/client`. Fixed upstream in
  `@svebcomponents/build` 0.3.3 (svebcomponents/svebcomponents#126); this is the
  toolchain bump that picks it up. No source or API changes.

- 6b1769a: Drop the vendored `HydrationHost` and use the one `@svebcomponents/ssr` ships.

  The local copy existed only to avoid destructuring `$props()`, which under an
  earlier `@svebcomponents/ssr` produced writable prop signals with no parent
  effect and broke hydration before the user's component mounted. On the current
  pin (`svelte` 5.56.4, `@svebcomponents/ssr` 0.3.1) that no longer reproduces:
  the SSR'd shadow DOM is still hydrated in place, with `experimental.async` and
  the async SSR wrapper both on or both off. Removing the vendored copy also
  removes the build-config aliasing that kept every build variant pointed at it,
  so the component now tracks upstream's host automatically. No API change.

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
