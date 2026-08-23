# @svebcomponents/atproto.bridge

The framework-neutral backend for `@svebcomponents/atproto.comments`. It
handles narrowly scoped ATProto OAuth, posts replies and toggles likes/reposts
through the reader's PDS, and proxies live reply signals from Microcosm
Spacedust to browser SSE clients.
It never stores comment bodies.

Handlers use the standard Fetch API, so they can be mounted in SvelteKit,
Astro, Hono, Bun, or another `Request -> Response` server.

```sh
pnpm add @svebcomponents/atproto.bridge
```

```ts
import { createAtprotoCommentsService } from "@svebcomponents/atproto.bridge";

const service = createAtprotoCommentsService({
  publicUrl: "https://atproto.example.com",
  basePath: "/atproto",
  sessionSecret: process.env.SESSION_SECRET!,
  keys: [process.env.OAUTH_PRIVATE_KEY!],
  stateStore,
  sessionStore,
  serviceSessionStore,
});

const response = await service.fetch(request);
```

## AppView

Unauthenticated profile lookups and handle resolution go through `appView`,
which defaults to `https://public.api.bsky.app`. Point it at any AppView
serving the `app.bsky.*` lexicons — a mirror, or your own deployment:

```ts
createAtprotoCommentsService({
  // ...
  appView: "https://appview.example.com",
});
```

This is independent of the component's own `appview` property, which decides
where the reader's browser reads thread snapshots from. Set both when you are
moving off the default.

## OAuth page branding

The bridge renders its handle-entry page with Svelte SSR. Self-hosted
deployments can customize the normal presentation without taking ownership of
the OAuth callback or browser session handoff:

```ts
createAtprotoCommentsService({
  // ...
  clientName: "Acme Comments",
  oauthPage: {
    title: "Sign in to join the conversation",
    brand: {
      name: "Acme",
      logoUrl: "/brand.svg",
      homeUrl: "https://www.acme.example",
    },
    theme: { accent: "#7c3aed" },
    links: {
      privacy: "/privacy",
      support: "/support",
    },
  },
});
```

Relative logo and link URLs resolve against `publicUrl`. `clientName` remains
the OAuth client identity shown by the user's provider; `brand.name` changes
only the bridge page.

For complete markup control, pass `renderSignInPage` as the second argument to
`createAtprotoCommentsService`. It receives the normalized presentation values
plus the bridge-owned form values. A custom form must submit `handle`, preserve
`origin` and `claim` in same-named hidden inputs, preserve `returnTo` in an
input named `return`, and use the supplied `actionUrl`. Only this handle-entry
page is replaceable; the callback and token handoff remain bridge-owned.

## Security model

**Narrow scopes.** The bridge asks the reader's provider for create-only
access to replies plus create/delete on likes and reposts:

```
atproto
repo:app.bsky.feed.post?action=create
repo:app.bsky.feed.like?action=create&action=delete
repo:app.bsky.feed.repost?action=create&action=delete
```

It cannot edit or delete the reader's posts, read their data beyond a public
profile snapshot, or touch anything else in their account. Delete is required
on likes/reposts only because un-liking and undoing a repost are deletes of
the viewer's own records.

**Tokens stay server-side.** ATProto access/refresh tokens (DPoP-bound) live
only in the bridge's session store. Browsers hold at most a short-lived,
origin-bound bridge JWT — never an ATProto credential.

**Origin binding.** The embedding origin travels through the OAuth flow, is
bound into every session token, and is checked against the request's `Origin`
header on state-changing calls. A token minted for one site is rejected
everywhere else; sign-in handoff requires a matching `Origin` on the polling
request. CORS echoes only the bound origin.

**Revocation.** Sign-out deletes the browser session _and_ revokes the ATProto
grant with the reader's PDS — "sign out" means the bridge can no longer act as
that account. Unused grants age out of the store on their own.

**Rate limits.** Replies and reactions are rate-limited per DID by default
(10 replies / 10 minutes, 60 reactions / 10 minutes). Only reply posts can be
created: root and parent are mandatory, so the bridge cannot be used to spam
top-level posts.

## API surface

```
GET    /client-metadata.json             OAuth client metadata (its URL is the client_id)
GET    /jwks.json                        public keys for private_key_jwt client auth
GET    /oauth/start?origin=…             begin sign-in (popup entry, handle page)
GET    /oauth/callback                   token exchange → session handoff page
GET    /api/session                      who is signed in (session profile snapshot)
POST   /api/session/refresh              renew the browser session
POST   /api/session/logout               delete session and revoke the ATProto grant
POST   /api/reply                        create a reply post as the signed-in reader
POST   /api/like, /api/repost            like/repost as the signed-in reader
DELETE /api/like, /api/repost            undo them (removes the reader's record)
GET    /api/comments/stream?thread=…     SSE reply signals for one thread
GET    /api/stats                        whole-service counts (no origins, no readers)
```

## Session modes

The default `sessionMode: "bearer"` is for a bridge embedded cross-origin. The
popup hands the component a short-lived bridge JWT that is bound to the
embedding origin. ATProto access and refresh tokens remain server-side.

For a bridge mounted on the same origin as the site, use:

```ts
createAtprotoCommentsService({
  // ...
  publicUrl: "https://your.blog",
  basePath: "/atproto",
  sessionMode: "cookie",
});
```

Cookie mode stores only an opaque session id in an `HttpOnly; SameSite=Lax;
Secure` cookie. State-changing API requests require a matching `Origin`
header. Cookie mode is intentionally a same-origin option; use bearer mode for
third-party embeds.

The component uses the same `service` property for both modes:

```html
<atproto-comments thread="at://..." service="/atproto"></atproto-comments>
```

## Live comment events

The public endpoint streams newly created descendants of one post:

```js
const thread = "at://did:plc:example/app.bsky.feed.post/3example";
const events = new EventSource(
  `/atproto/api/comments/stream?thread=${encodeURIComponent(thread)}`,
);

events.addEventListener("status", ({ data }) => {
  const { upstream } = JSON.parse(data); // connected | reconnecting
});

events.addEventListener("comment", ({ data }) => {
  const { uri } = JSON.parse(data);
  // Spacedust signals a change; refetch the public thread to render it.
  console.log("new comment", uri);
});
```

The endpoint also accepts a post URL from any viewer using the
`/profile/…/post/…` scheme; the host is discarded and the thread is resolved
through the configured AppView.

### Upstream responsibility

One service process opens at most **one** filtered Spacedust WebSocket,
regardless of how many threads are active. It sends dynamic
`options_update` messages as the watched subject set changes, then fans each
matching link out only to SSE viewers of that thread. When the last viewer
leaves, the upstream closes.

This protects the community-run Microcosm service from one upstream connection
per browser or per thread. The broker also:

- closes browser streams that stop consuming;
- sends 15-second SSE heartbeats for proxies;
- applies exponential reconnect backoff with jitter;
- caps active threads and viewers;
- closes hidden-tab connections in the official component.

Defaults are 5,000 active threads, 10,000 total SSE viewers, and 1,000 viewers
per thread. These are safety ceilings, not sizing claims—benchmark your runtime
and set lower limits appropriate to its memory and file-descriptor budget.

```ts
createAtprotoCommentsService({
  // ...
  commentStream: {
    spacedustUrl: "wss://spacedust.microcosm.blue",
    maxThreads: 2_000,
    maxSubscribers: 5_000,
    maxSubscribersPerThread: 500,
    heartbeatMs: 15_000,
  },
});
```

Spacedust v0 has no replay cursor. Reconnect status is therefore a correctness
signal: clients should fetch a fresh AppView snapshot when the upstream
connects again. The official component does this automatically.

Run the bridge on a long-lived, streaming-capable process. Put per-IP
connection admission and request rate limiting at the edge, where the real
client address is known. Avoid request-duration-limited serverless functions.

## Deployment requirements

- Node 22.19 or newer with WebSocket support.
- A stable HTTPS public URL; the OAuth client id is derived from it.
- Persistent implementations of the OAuth state, OAuth session, service
  session, and optional claim stores.
- Stable signing keys and a 32+ character session secret.
- Proxy buffering disabled for `text/event-stream` and idle timeouts longer
  than the heartbeat interval.
- Graceful shutdown and OS file-descriptor limits sized for SSE concurrency.

The repository's `apps/host` is an adapter-node reference deployment with
SQLite stores and the bridge mounted at `/atproto`.

See the complete guide at
[atproto.svebcomponents.dev](https://atproto.svebcomponents.dev/#self-host).
