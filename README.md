# atproto-comments

> [!WARNING]
> Alpha: the read-only component works end-to-end (Phase 1); not yet published to npm.

Drop-in Bluesky/ATProto comments for any blog, built as SSR-able, **hydratable** web components with [svebcomponents](https://svebcomponents.dev). Readers sign in with their ATProto account; comments live in the social web, not in our database.

## Status

- ✅ **Phase 1 — read-only `<atproto-comments>`**: fetches and renders a Bluesky thread (nested replies, tombstones for deleted/blocked posts, moderation-label collapse, depth capping, rich text from facets, root like/repost stats, "Reply on Bluesky" links). Self-contained bundle ~26 KB gz.
- ✅ **SSR + hydration**: server-rendered declarative shadow DOM is adopted in place on the client — verified by e2e (same-node identity, zero client refetch), including inside a hydrating SvelteKit host.
- 🔜 Phase 2: Standard.site auto-discovery · Phase 3: hosted OAuth posting bridge — see the [roadmap](./04-roadmap.md).

## Usage sketch

```html
<script type="module" src=".../atproto-comments/dist/client/index.js"></script>

<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
></atproto-comments>
```

SvelteKit blogs can prefetch server-side and pass `threadData` for flash-free,
refetch-free SSR — see [`apps/web/src/routes/+page.server.ts`](./apps/web/src/routes/+page.server.ts).

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
configs/*                   shared eslint/prettier/tsconfig presets
```

> [!NOTE]
> Until the pending svebcomponents release ships, `pnpm-workspace.yaml` links
> `@svebcomponents/*` from a local checkout (see the comment there).

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
