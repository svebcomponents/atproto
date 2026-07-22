# atproto-comments

> [!WARNING]
> Alpha: read-only rendering **and** in-page sign-in + posting work end-to-end (Phases 1–2); not yet published to npm, and the hosted bridge is not yet deployed to a public domain.

Drop-in atmosphere/ATProto comments for any blog, built as SSR-able, **hydratable** web components with [svebcomponents](https://svebcomponents.dev). Readers sign in with their ATProto account and reply from the page; comments live in commenters' own repos on the social web, not in our database.

## Status

- ✅ **Phase 1 — read-only `<atproto-comments>`**: fetches and renders a thread (nested replies, tombstones for deleted/blocked posts, moderation-label collapse, depth capping, rich text from facets, root like/repost stats, permalinks to the post). Self-contained bundle ~26 KB gz.
- ✅ **SSR + hydration**: server-rendered declarative shadow DOM is adopted in place on the client — verified by e2e (same-node identity, zero client refetch), including inside a hydrating SvelteKit host.
- ✅ **Phase 2 — in-page sign-in & posting**: set a `service` and readers sign in with their atmosphere account (OAuth popup + COOP-safe nonce-claim handshake), then reply to the thread or to any comment via a modal composer with a grapheme counter and optimistic append. The hosted bridge is `packages/service-core` (framework-agnostic OAuth/posting; ATProto tokens stay server-side), mounted in `apps/web` at `/atproto`. A `viewer` prop routes outbound links through any atmosphere viewer (bsky.app default, e.g. deer.social).
- 🔜 Phase 3: Standard.site auto-discovery. Also pending before announcing: deploy the bridge to a real domain + a security pass. See the [roadmap](./04-roadmap.md).

## Usage sketch

```html
<script type="module" src=".../atproto-comments/dist/client/index.js"></script>

<!-- read-only -->
<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
></atproto-comments>

<!-- with sign-in + posting: point service at a deployed bridge -->
<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
  service="https://comments.example.com"
></atproto-comments>
```

With svebcomponents SSR, the component fetches its thread on the server and
serializes `threadData` for flash-free, refetch-free hydration. Hosts can still
pass `threadData` explicitly to skip the server fetch. Browser-only consumers
fall back to the same component-owned fetch after connection.

## Planning docs

- [00-overview.md](./00-overview.md) — executive summary & decisions
- [01-architecture.md](./01-architecture.md) — system architecture & SSR design
- [02-component-design.md](./02-component-design.md) — component APIs
- [03-oauth-service.md](./03-oauth-service.md) — hosted auth/posting bridge & self-hosting
- [04-roadmap.md](./04-roadmap.md) — phases & open questions

## Workspace

```
apps/web                    showcase site + (later) hosted OAuth/posting service (SvelteKit)
components/atproto-comments <atproto-comments> web component
packages/atproto-client     isomorphic ATProto read utilities + service client
packages/service-core       framework-neutral OAuth and posting bridge
configs/*                   shared eslint/prettier/tsconfig presets
```

The publishable packages are named `@svebcomponents/atproto.comments`,
`@svebcomponents/atproto.client`, and `@svebcomponents/atproto.bridge`.
Changesets manages their versions and the release workflow publishes them to
npm with provenance after its release PR is merged.

## Development

```bash
pnpm install
pnpm dev        # turbo watch dev — showcase at localhost:5173
pnpm build
pnpm test       # unit tests (vitest)

# e2e: hydration guarantees against the built adapter-node server
# (requires network access — the showcase renders a live Bluesky thread)
pnpm build && pnpm --filter web test:e2e
```
