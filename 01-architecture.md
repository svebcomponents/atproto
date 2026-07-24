# System Architecture

Date: 2026-07-06

## Big picture

```
┌────────────────────────────── any blog page ──────────────────────────────┐
│  <atproto-comments thread="at://…" service="https://comments.example">    │
│        │ read (public, CORS)                │ auth + write (bearer)       │
└────────┼────────────────────────────────────┼──────────────────────────────┘
         ▼                                    ▼
  public.api.bsky.app                 hosted service (apps/host)
  app.bsky.feed.getPostThread         ├─ ATProto OAuth (confidential client)
  app.bsky.feed.getLikes              ├─ session store (SQLite)
         │                            └─ com.atproto.repo.createRecord
         ▼                                    │ (user's PDS, DPoP tokens)
  AppView aggregates the network              ▼
         ▲                            commenter's own ATProto repo
         └──── firehose ◄─────────────────────┘
```

Reads never touch our service. Writes always go through it. The service stores OAuth/session state, never comment content — comments land in the commenter's repo and flow back into the thread via the network.

## Monorepo layout

Scaffold with `pnpx degit svebcomponents/template`, keep its `apps/components/configs` split, add `packages/` for non-component code:

```
svebcomponent-bsky/
├── apps/
│   └── web/                        # renamed from apps/svelte-kit
│       ├── src/routes/             # showcase pages + docs
│       ├── src/routes/oauth/…      # OAuth start/callback (see 03)
│       ├── src/routes/api/…        # /session, /reply, …
│       └── src/hooks.server.ts     # ElementRendererRegistry setup
├── components/
│   ├── atproto-comments/           # core component (Phase 1)
│   └── standard-site-comments/     # discovery wrapper (Phase 3)
│   # standard-site-post/           # Phase 5, deferred
├── packages/
│   ├── atproto-client/             # isomorphic reads + service client + types
│   └── service-core/               # (Phase 2) OAuth/session/posting logic
└── configs/                        # eslint / prettier / tsconfig presets
```

Update `pnpm-workspace.yaml` packages to `apps/*`, `components/*`, `packages/*`, `configs/*`.

### Why one app for showcase + service

The template's SvelteKit app already exists to consume/SSR the components; the OAuth service is a handful of server routes plus persistent storage. Splitting them into two deployables now adds coordination cost with no benefit — the showcase _is_ the best integration test for the service. If the hosted product grows real traffic, `packages/service-core` is the seam along which to extract a dedicated service later; keep route handlers thin from day one.

The same seam is the **self-hosting story**: `service-core` exposes framework-agnostic `Request → Response` fetch handlers, so a blog can mount the entire bridge into its own SvelteKit/Astro/Hono app with one catch-all route — becoming its own first-party OAuth client — while `apps/host` is merely the reference mount. Details in [03-oauth-service.md](./03-oauth-service.md#self-hosting).

## Package boundaries

### `packages/atproto-client` — isomorphic, framework-free

The single most important boundary. Everything that talks to the network lives here, with **no Svelte imports**, so it:

- runs identically in the browser and in Node during SSR (both sync-prefetched and async-rendered),
- is unit-testable without DOM or component harnesses,
- could later back a React/vanilla adapter without touching components.

Contents:

- **AT URI utilities**: parse/format `at://did/collection/rkey`, convert `https://bsky.app/profile/…/post/…` URLs → AT URIs (accepting both makes the component much friendlier).
- **Identity resolution**: handle → DID (`com.atproto.identity.resolveHandle` or DNS/HTTP well-known via AppView), DID → PDS endpoint (plc.directory / did:web). Needed for Standard.site record fetches, which live on the author's PDS, not the AppView.
- **Thread reads**: `getPostThread(uri, { depth, parentHeight })` against a configurable AppView (default `public.api.bsky.app`), plus `getLikes` for the root post.
- **Thread normalization**: raw `getPostThread` unions (`threadViewPost | notFoundPost | blockedPost`) → a clean `CommentTree` model with explicit variants: `comment`, `deleted`, `blocked`, `not-found`, `truncated` (depth exceeded → "continue on Bluesky" link). Moderation labels surfaced per node. This normalization is where most correctness edge cases live — keeping it in a pure function with fixture-based tests is the payoff of this package.
- **Standard.site reads**: fetch `site.standard.document` via `com.atproto.repo.getRecord` on the resolved PDS; extract `bskyPostRef`.
- **Service client**: typed wrapper for the hosted service API (`getSession`, `startAuth`, `postReply`, …) used by components in authenticated mode.
- **Shared types**: `CommentTree`, `CommentNode`, service DTOs.

Rich text (facets) handling also lives here as a pure function: facets index into the post text by **UTF-8 byte offsets**, not JS string indices — segmenting must encode/decode properly. Output a segment list (`text | link | mention | tag`) the component maps to DOM.

### `components/atproto-comments`

Svelte 5 custom element consuming `atproto-client`. Owns rendering, interaction, styling, and the auth UX (delegating protocol work to the service client). Ships svebcomponents' standard dual build: `.` (client, Svelte bundled) and `./ssr` (ElementRenderer).

### `components/standard-site-comments`

Thin wrapper: discover `<link rel="site.standard.document">` in the light DOM/document, resolve `bskyPostRef` via `atproto-client`, then render `<atproto-comments>` internally with the resolved thread URI. No duplicated rendering logic.

## SSR & data-flow design

This is the subtle part. Constraints observed from `@svebcomponents/ssr`:

1. SSR goes through Lit Labs SSR: the registered `ElementRenderer` renders the component's shadow DOM into **declarative shadow DOM** in the HTML payload.
2. An adjacent `src/index.ssr.ts` prepare hook may return a promise, allowing the component package to fetch before `renderShadow()` without putting server dependencies in its browser bundle.
3. Rich properties written by the hook are serialized into the declarative shadow root. The custom element hydrates that DOM in place and receives the same values, avoiding a client refetch.

Data acquisition follows this fallback order:

### Tier 1 — explicit `threadData` property

```svelte
<script>
  // +page.svelte — data fetched in +page.server.ts via atproto-client
  let { data } = $props();
</script>
<atproto-comments thread={data.threadUri} threadData={data.thread}></atproto-comments>
```

Server-side, the svebcomponents wrapper routes rich values through `setProperty` → the SSR render uses it with no component-owned network request. Client-side, the value is restored for hydration. The adjacent prepare hook returns synchronously when this property exists, so hosts retain full control and do not require async SSR for that render.

### Tier 2 — component-owned SSR fetch

When `thread` is present and `threadData` is absent, `src/index.ssr.ts` calls `fetchCommentTree` before rendering. The resulting tree is assigned through the renderer's `setProperty`, which both renders it immediately and serializes it for hydration. `appview` and `viewer` overrides are forwarded. Fetch failures do not fail the host request; they leave Tier 3 available.

### Tier 3 — browser self-fetch

- Browser-only/CDN usage fetches on connection (skeleton → thread).
- If the server prepare fetch fails, hydration follows the same path and exposes the component's normal error/retry behavior.

Freshness is event-driven rather than time-based. The preloaded snapshot renders
immediately; an SSE `connected` status triggers one background sync, and a
Spacedust reply signal triggers a coalesced AppView refresh with a short
indexing retry. Reconnect and visibility resume are additional correctness
boundaries. Locally posted replies remain optimistically overlaid until their
URI appears in an AppView snapshot.

### Findings from the scaffold (2026-07-06, verified against real builds)

Both upstream bugs found here are now **fixed and released in svebcomponents** (≥0.1.0); this repo consumes the packages from npm. Kept for the record:

1. ~~The async wrapper is mandatory with current Svelte~~ **Fixed.** Since svelte ~5.36, `render()` results are always thenable, which made `renderShadow` treat every component as async and killed the sync wrapper (`collectResultSync` threw for everything). The renderer now uses the `RenderOutput`'s lazy sync getters and only falls back to the promise path for genuinely async components (svelte's `await_invalid` signal). `async: true` + `experimental.async` is only needed once components actually `await` during SSR (we'll enable it in Phase 1 for async thread fetching).
2. ~~Never statically import the component's client build in SSR'd app code~~ **Fixed.** The generated `dist/server/ssr.js` now installs the DOM shim via `@svebcomponents/ssr/shim` first and dynamically imports the client bundle, which is chunk-order-proof. Static imports in pages are safe again (page chunks evaluate after server init). Root cause for the record: svelte's `SvelteElement` is captured at module-eval time (`typeof HTMLElement === 'function'` at module scope), and rollup code-splitting could evaluate the client bundle in a shared chunk before the shim side effect ran — prod-only (`adapter-node`), dev unaffected.
3. **Released in ≥0.2.0.** Adjacent `.ssr.ts` prepare hooks let a library own asynchronous SSR data acquisition. Values set through `setProperty` are included in rich-prop hydration transport, while explicit preloaded data keeps rendering synchronous.

### SSR registration ergonomics

Host apps register renderers once (template pattern):

```ts
// hooks.server.ts
import { ElementRendererRegistry } from "@svebcomponents/ssr";
import AtprotoCommentsRenderer from "@svebcomponents/atproto.comments/ssr";
ElementRendererRegistry.set("atproto-comments", AtprotoCommentsRenderer);
```

Docs must cover: SvelteKit (full support), other Vite SSR frameworks (via `@svebcomponents/ssr/vite`), and no-SSR usage (CDN script + Tier 3), plus Tier 2 for everything in between.

## Distribution

- **npm**: `@svebcomponents/atproto.comments`, `@svebcomponents/atproto.client`, and `@svebcomponents/atproto.bridge`. The component exposes its browser bundle at `.` and renderer at `./ssr`.
- **CDN**: `https://cdn.jsdelivr.net/npm/@svebcomponents/atproto.comments/dist/client/index.js` — the client build bundles Svelte while leaving the small `@svebcomponents/utils` runtime external.
- **Versioning**: Changesets creates release PRs; merging one builds and publishes public packages with npm provenance.

## Dependencies policy

- `atproto-client`: prefer zero runtime deps; hand-roll the ~4 XRPC calls over `fetch` rather than pulling `@atproto/api` (which is large and drags in rich-text/moderation machinery we reimplement leanly). Use `@atproto/api` **types** as a dev dependency for fidelity if helpful.
- `apps/host` (service): `@atproto/oauth-client-node` is the right tool — do not hand-roll DPoP/PAR/PKCE (see [03-oauth-service.md](./03-oauth-service.md)).
- Components: only `atproto-client` + svelte peer tooling from the template.
