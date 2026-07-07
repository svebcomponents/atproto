# System Architecture

Date: 2026-07-06

## Big picture

```
┌────────────────────────────── any blog page ──────────────────────────────┐
│  <atproto-comments thread="at://…" service="https://comments.example">    │
│        │ read (public, CORS)                │ auth + write (bearer)       │
└────────┼────────────────────────────────────┼──────────────────────────────┘
         ▼                                    ▼
  public.api.bsky.app                 hosted service (apps/web)
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

The template's SvelteKit app already exists to consume/SSR the components; the OAuth service is a handful of server routes plus persistent storage. Splitting them into two deployables now adds coordination cost with no benefit — the showcase *is* the best integration test for the service. If the hosted product grows real traffic, `packages/service-core` is the seam along which to extract a dedicated service later; keep route handlers thin from day one.

The same seam is the **self-hosting story**: `service-core` exposes framework-agnostic `Request → Response` fetch handlers, so a blog can mount the entire bridge into its own SvelteKit/Astro/Hono app with one catch-all route — becoming its own first-party OAuth client — while `apps/web` is merely the reference mount. Details in [03-oauth-service.md](./03-oauth-service.md#self-hosting).

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
2. `renderShadow()` supports promise results — so with Svelte's async SSR, a component may `await` network calls during server rendering.
3. **Svelte custom elements do not hydrate.** When the client bundle loads and the element upgrades, Svelte instantiates the component fresh and replaces the declaratively-rendered shadow content. Server-rendered DOM buys first paint and SEO, not state.

Consequence: if the component's only data source is "fetch on mount", SSR'd pages will paint the full thread, then blank/reflash while the client refetches. Unacceptable. So data acquisition is designed as a **three-tier fallback**, checked in order at client init *and* at SSR time:

### Tier 1 — `threadData` property (SvelteKit / JS-framework hosts)

```svelte
<script>
  // +page.svelte — data fetched in +page.server.ts via atproto-client
  let { data } = $props();
</script>
<atproto-comments thread={data.threadUri} threadData={data.thread}></atproto-comments>
```

Server-side, the svebcomponents wrapper routes rich values through `setProperty` → the SSR render uses it (no network on the component's part). Client-side, Svelte sets the property on the upgraded element → the client render uses the same data. No double fetch, no flash, works without async SSR. **This is the default path for the showcase app.**

### Tier 2 — embedded JSON child (any SSG / SSR framework)

```html
<atproto-comments thread="at://…">
  <script type="application/json" data-atproto-comments>
    {"thread": …normalized tree…}
  </script>
</atproto-comments>
```

Static site generators (Astro, Eleventy, Hugo with a build step) can prefetch the thread at build time and inline it. The component reads the light-DOM script on connect before considering a fetch. Same mechanism doubles as a cache-priming channel for the async-SSR path below. (Light-DOM children survive in HTML regardless of shadow DOM; a `data-` marker keeps it unambiguous.)

### Tier 3 — self-fetch

- **Client**: fetch on connect (spinner → thread). The zero-config CDN path.
- **Server (async SSR)**: when the host app opts into Svelte async SSR, the component awaits the fetch during `renderShadow()`. The catch: without Tier 1/2 data on the client, the upgrade still refetches. So async SSR mode should *also* serialize what it fetched into the Tier-2 JSON child — the SSR wrapper renders light-DOM children, making the server-fetched data readable by the upgraded client element. If that serialization proves awkward in practice, async-SSR-without-preload degrades to "SEO-perfect HTML + one client refetch", which is still fine for a v1.

Freshness: when preloaded data is present, optionally revalidate in the background (`revalidate` attribute) and morph in changes — important after the user posts a comment, where we locally append the new reply optimistically, then refetch.

### Findings from the scaffold (2026-07-06, verified against real builds)

Both upstream bugs found here are now **fixed in svebcomponents** (branch `fix/ssr-svelte-536-and-shim-ordering`); this repo consumes the fix via temporary `link:` overrides in `pnpm-workspace.yaml` until a release ships. Kept for the record:

1. ~~The async wrapper is mandatory with current Svelte~~ **Fixed.** Since svelte ~5.36, `render()` results are always thenable, which made `renderShadow` treat every component as async and killed the sync wrapper (`collectResultSync` threw for everything). The renderer now uses the `RenderOutput`'s lazy sync getters and only falls back to the promise path for genuinely async components (svelte's `await_invalid` signal). `async: true` + `experimental.async` is only needed once components actually `await` during SSR (we'll enable it in Phase 1 for async thread fetching).
2. ~~Never statically import the component's client build in SSR'd app code~~ **Fixed.** The generated `dist/server/ssr.js` now installs the DOM shim via `@svebcomponents/ssr/shim` first and dynamically imports the client bundle, which is chunk-order-proof. Static imports in pages are safe again (page chunks evaluate after server init). Root cause for the record: svelte's `SvelteElement` is captured at module-eval time (`typeof HTMLElement === 'function'` at module scope), and rollup code-splitting could evaluate the client bundle in a shared chunk before the shim side effect ran — prod-only (`adapter-node`), dev unaffected.
3. Watch-out for Tier 1: framework-set *properties* on a not-yet-upgraded element is the classic pre-upgrade-property CE gotcha — verify Svelte's CE wrapper handles pre-upgrade property shadowing when implementing `threadData`.

### SSR registration ergonomics

Host apps register renderers once (template pattern):

```ts
// hooks.server.ts
import { ElementRendererRegistry } from "@svebcomponents/ssr";
import AtprotoCommentsRenderer from "@yourscope/atproto-comments/ssr";
ElementRendererRegistry.set("atproto-comments", AtprotoCommentsRenderer);
```

Docs must cover: SvelteKit (full support), other Vite SSR frameworks (via `@svebcomponents/ssr/vite`), and no-SSR usage (CDN script + Tier 3), plus Tier 2 for everything in between.

## Distribution

- **npm**: each component package, standard svebcomponents exports (`.` + `./ssr`). Scope TBD (see open questions in [04-roadmap.md](./04-roadmap.md)).
- **CDN**: `https://cdn.jsdelivr.net/npm/@scope/atproto-comments/dist/client/index.js` — works because the client build bundles Svelte. Verify the bundle is single-file (or that chunk imports resolve on jsdelivr) and track bundle size; Svelte 5's CE runtime keeps this in the tens-of-KB range, worth a size budget in CI.
- **Versioning**: changesets (already wired in the template's release script).

## Dependencies policy

- `atproto-client`: prefer zero runtime deps; hand-roll the ~4 XRPC calls over `fetch` rather than pulling `@atproto/api` (which is large and drags in rich-text/moderation machinery we reimplement leanly). Use `@atproto/api` **types** as a dev dependency for fidelity if helpful.
- `apps/web` (service): `@atproto/oauth-client-node` is the right tool — do not hand-roll DPoP/PAR/PKCE (see [03-oauth-service.md](./03-oauth-service.md)).
- Components: only `atproto-client` + svelte peer tooling from the template.
