# atproto-comments

> [!WARNING]
> Alpha: the component, hosted-backend contract, and self-hosted bridge work
> end-to-end, but the packages and public service have not been announced yet.

A web component that renders an AT Protocol (Bluesky) post thread as a comment section, built with [svebcomponents](https://svebcomponents.dev). Supports server-side rendering and hydration. Readers can sign in with an ATProto account and reply from the page; replies are ordinary `app.bsky.feed.post` records in each commenter's own repo, and neither the component nor the bridge stores comment content.

## Status

Implemented:

- Thread rendering: fetches a thread and renders nested replies, tombstones
  for deleted or blocked posts, moderation-label collapse, depth capping,
  rich text from facets, root like/repost counts, and permalinks to the post.
  Self-contained bundle, ~26 KB gzipped.
- SSR and hydration: declarative shadow DOM rendered on the server is adopted
  in place on the client, including inside a hydrating SvelteKit host
  (covered by e2e tests for same-node identity and rich-prop transport).
- In-page sign-in and posting: set `service` and readers can sign in with
  their ATProto account (OAuth popup with a COOP-safe nonce-claim handshake)
  and reply to the thread or to any comment through a modal composer with a
  grapheme counter and optimistic append. The bridge lives in
  `packages/service-core` (framework-agnostic OAuth and posting; ATProto
  tokens stay on the server) and is mounted by `apps/host` at `/atproto`.
  The `viewer` property routes outbound profile/post links through any
  AppView (bsky.app by default, e.g. deer.social).
- Live updates without polling: signed-in readers subscribe to the SSE
  bridge. One filtered Microcosm Spacedust WebSocket per bridge process
  serves every active thread; a connection or reply event triggers a
  coalesced AppView refresh. A reconnect triggers a fresh read because
  Spacedust v0 has no replay cursor. Set `live="all"` to stream for signed-out
  readers too — see [Reader privacy](#reader-privacy) for what that changes.

Still open before publishing: a real-account OAuth e2e test and deploying the
bridge to a real domain. See the [roadmap](./04-roadmap.md).

## Usage

```html
<script type="module" src=".../atproto-comments/dist/client/index.js"></script>

<!-- Hosted OAuth, posting, and live updates are enabled by default. -->
<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
></atproto-comments>

<!-- Point service at your own bridge to self-host OAuth, posting, and live updates. -->
<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/…"
  service="/atproto"
></atproto-comments>
```

With svebcomponents SSR, the component fetches its thread on the server and
serializes `threadData` so hydration renders the same comments without a
loading flash; after connecting, the live connection performs one background
sync. Browser-only consumers fetch immediately and then use the same
event-driven refresh path.

## Reader privacy

The component is built so that reading a comment section is not an event
anyone has to record.

- **Comments are never stored by this project.** Replies are ordinary
  `app.bsky.feed.post` records written to each commenter's own repo through
  their own PDS. The bridge keeps no copy.
- **Signed-out readers do not contact the bridge.** Thread content is read
  from the AppView (or server-rendered), and the component holds no
  connection to the service until someone signs in. `live="all"` opts every
  reader into the live stream, which means their IP address and the page
  they are on reach whichever bridge you point at — reasonable when that
  bridge is your own, worth disclosing when it is the hosted one.
- **Self-host to keep everything first-party.** Set `service` to your own
  deployment and no third party is involved at all. Pass `allowedOrigins` so
  only your sites can use it.
- **The hosted bridge is a third party to your readers.** If you use the
  default `service`, say so where you say what else your site loads.

Sign-out revokes the ATProto grant, not just the browser session, and unused
grants expire on their own. Bridge operators should truncate client IPs in
access logs and keep retention short.

## Planning docs

- [00-overview.md](./00-overview.md) — executive summary & decisions
- [01-architecture.md](./01-architecture.md) — system architecture & SSR design
- [02-component-design.md](./02-component-design.md) — component APIs
- [03-oauth-service.md](./03-oauth-service.md) — hosted auth/posting bridge & self-hosting
- [04-roadmap.md](./04-roadmap.md) — phases & open questions

## Workspace

```
apps/host                   documentation site + hosted OAuth/live-events service (SvelteKit)
components/atproto-comments <atproto-comments> web component
packages/atproto-client     isomorphic ATProto read utilities + service client
packages/service-core       framework-neutral OAuth and posting bridge
configs/*                   shared eslint/prettier/tsconfig presets
```

The publishable packages are named `@svebcomponents/atproto.comments`,
`@svebcomponents/atproto.client`, and `@svebcomponents/atproto.bridge`.
Changesets manages their versions and the release workflow publishes them to
npm with provenance after its release PR is merged. See
[`RELEASING.md`](./RELEASING.md) for the token-free trusted-publishing setup and
the one-time initial package bootstrap.

## Development

```bash
pnpm install
pnpm dev        # turbo watch dev — showcase at localhost:5173
pnpm build
pnpm test       # unit tests (vitest)

# e2e: hydration guarantees against the built adapter-node server
# (requires network access — the showcase renders a live Bluesky thread)
pnpm build && pnpm --filter atproto-host test:e2e
```
