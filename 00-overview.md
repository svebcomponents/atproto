# ATProto Blog Components — Planning Overview

Date: 2026-07-06 (planning snapshot)
Status: Phases 1–2 built — read-only rendering + in-page sign-in & posting work end-to-end; not yet published/deployed. Live status lives in [04-roadmap.md](./04-roadmap.md); this doc is kept as the original planning snapshot.

This directory contains the planning docs for a set of SSR-able web components (built with [svebcomponents](https://svebcomponents.dev)) that bring ATProto/Bluesky-native comments and post rendering to any blog, plus a hosted OAuth/posting service.

Raw product brainstorm: [atproto-blog-architecture-notes.md](./atproto-blog-architecture-notes.md)

## Document index

| Doc | Contents |
| --- | --- |
| [01-architecture.md](./01-architecture.md) | System architecture, monorepo layout, package boundaries, SSR & data-flow design |
| [02-component-design.md](./02-component-design.md) | Component APIs, rendering states, rich text, styling, events |
| [03-oauth-service.md](./03-oauth-service.md) | Hosted auth/posting bridge: OAuth flows, embedded-auth model, scopes, storage, endpoints, abuse controls |
| [04-roadmap.md](./04-roadmap.md) | Phased implementation plan, step-0 chores, open questions with recommendations |

## Executive summary

**Product**: open-source web components (`<atproto-comments>`, `<standard-site-comments>`, later `<standard-site-post>`) + a hosted service that handles ATProto OAuth and posting so blog readers can comment directly from the page. Comments live in commenters' own ATProto repos; the service owns no content.

**Foundation**: scaffolded from `svebcomponents/template` (pnpm + turbo, `apps/` + `components/` + `configs/`). The template's SvelteKit app becomes both the component showcase *and* the hosted OAuth service. A new `packages/` group holds framework-agnostic logic (thread fetching/normalization, AT URI handling, service client).

**Differentiator vs prior art**: existing libraries ([czue/bluesky-comments](https://github.com/czue/bluesky-comments) (React), [florianschepp/bsky-comments](https://github.com/florianschepp/bsky-comments) (vanilla WC)) are read-only render-widgets. None offer (a) real SSR, (b) in-page authenticated posting, or (c) Standard.site awareness. All three are within reach here.

## Key findings from research (2026-07)

1. **svebcomponents SSR already supports async rendering.** `SvelteCustomElementRenderer.renderShadow()` handles promise-returning `render()` results, and `AsyncCustomElementWrapper` exists. A component can `await fetch(...)` during SSR. This makes "SSR-able, optionally asynchronous" a first-class capability, not a hack.
2. **Client builds bundle Svelte by default** (`externalSvelte: false`), so the CDN drop-in story (`<script type="module" src="https://cdn.jsdelivr.net/npm/...">`) works with zero extra tooling.
3. **ATProto granular OAuth scopes have shipped.** A posting bridge can request narrowly: `atproto repo:app.bsky.feed.post?action=create rpc:app.bsky.actor.getProfile?aud=did:web:api.bsky.app#bsky_appview`. No more `transition:generic` full-account access. Permission sets are arriving and may simplify the consent screen further.
4. **Standard.site's `site.standard.document` lexicon has `bskyPostRef`** — a strong ref to the cross-posted Bluesky post. `<standard-site-comments>` auto-discovery (page `<link>` → document record → `bskyPostRef` → thread) is fully supported by the schema.
5. **The public AppView (`public.api.bsky.app`) serves `app.bsky.feed.getPostThread` without auth and with CORS**, so read-only mode needs no backend at all.
6. **The template's dependency catalog is stale** (svelte 5.34.7, vite 6, kit 2.20.5). Async SSR in Svelte requires a newer 5.x with the async/experimental support the `@svebcomponents/ssr` promise path relies on. Dependency bump is step 0 (see roadmap).

## The two hard problems (solved in these docs)

These are the design points that existing notes and prior art don't address; both have concrete proposals in the linked docs:

1. **Embedded auth across origins** ([03-oauth-service.md](./03-oauth-service.md)): the component runs on `someblog.com`, the service on `comments.example.com`. Third-party cookies are blocked by all major browsers in 2026, so cookie-based sessions don't reach the component. Proposal: **popup OAuth flow + `postMessage` handoff + short-lived, narrowly-scoped bearer session tokens** stored by the component, with origin-bound tokens and server-side ATProto token custody (BFF pattern — real OAuth tokens never leave the service).
2. **SSR without double-render jank** ([01-architecture.md](./01-architecture.md)): Svelte-compiled custom elements re-render from scratch when they upgrade on the client — declaratively-rendered shadow DOM is replaced, and a naive component would refetch, causing a flash. Proposal: **a preloaded-data channel** (`threadData` property for SvelteKit users, plus a light-DOM `<script type="application/json">` child for any-SSG users) so the client render is instant from embedded data, with optional background revalidation.

## Recommended decisions (details & alternatives in the docs)

| Decision | Recommendation |
| --- | --- |
| Primary component name | `<atproto-comments>` (docs say "renders Bluesky `app.bsky.feed.post` threads today") |
| Read path | Public AppView from the client (and from the server during SSR); no proxy in MVP |
| Write path | Hosted service only (BFF); component never touches ATProto tokens |
| Auth handoff | Popup + `postMessage` + service-issued session token (JWT), origin-bound |
| Service stack | SvelteKit server routes in the template's app, `@atproto/oauth-client-node`, SQLite (libsql) storage, `adapter-node` deploy |
| Shared logic | Isomorphic `packages/atproto-client` (fetch/normalize/types), no Svelte dependency |
| Standard.site rendering | Defer `<standard-site-post>` to a later phase; ship comments first |
| Self-hosting | First-class: `service-core` exposes framework-agnostic fetch handlers so anyone can mount the bridge into their own app (same-origin = first-party auth, own OAuth client) or deploy the reference app; hosted instance is just our deployment of the same code |
| Likes | Show root-post like count in the comments header (read-only) in MVP; authenticated liking later via `repo:app.bsky.feed.like` |

## Suggested repo shape (this repo)

```
svebcomponent-bsky/            ← degit svebcomponents/template, then extend
├── apps/
│   └── web/                   ← showcase site + docs + hosted OAuth service
├── components/
│   ├── atproto-comments/      ← the core component
│   └── standard-site-comments/
├── packages/
│   ├── atproto-client/        ← isomorphic read logic + service API client
│   └── service-core/          ← (later) OAuth/session/posting logic, testable outside SvelteKit
└── configs/                   ← eslint/prettier/tsconfig from template
```

See [01-architecture.md](./01-architecture.md) for rationale and boundaries.
