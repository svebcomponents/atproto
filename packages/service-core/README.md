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
the viewer's own records. Notably there is no read scope: `GET /api/viewer`
reads which comments the reader has already liked from a public backlink
index (see below), not from their account.

**Tokens stay server-side.** ATProto access/refresh tokens (DPoP-bound) live
only in the bridge's session store. Browsers hold at most a short-lived,
origin-bound bridge JWT — never an ATProto credential.

**Origin binding.** The embedding origin travels through the OAuth flow, is
bound into every session token, and is checked against the request's `Origin`
header on state-changing calls. A token minted for one site is rejected
everywhere else; sign-in handoff requires a matching `Origin` on the polling
request. CORS echoes only the bound origin.

**Session renewal.** Bearer tokens live for `sessionTtlSeconds` (1 hour by
default). The client renews a token once it is past half its lifetime, and
`/api/session/refresh` also accepts a token that expired within
`sessionRefreshWindowSeconds` (7 days by default). That keeps a returning
reader signed in, while the exchange still requires the token's origin and a
live session. No other endpoint accepts an expired token.

Refresh rotates. Only the most recently minted token can be renewed, and
renewing retires it (two pages renewing within the same minute both succeed).
A token copied out of a page therefore keeps working only until it expires,
or, renewed, only until the reader's own client renews. If the thief renews
first, the reader's next renewal fails and they are signed out, so the
theft shows.

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
POST   /api/session/retire               end this browser session, keeping the ATProto grant
POST   /api/session/logout               delete session and revoke the ATProto grant
POST   /api/reply                        create a reply post as the signed-in reader
POST   /api/like, /api/repost            like/repost as the signed-in reader
DELETE /api/like, /api/repost            undo them (removes the reader's record)
GET    /api/viewer?like=…&repost=…       the reader's own like/repost records for those posts
GET    /api/comments/stream?thread=…     SSE reply signals for one thread
GET    /api/stats                        whole-service counts (no origins, no readers)
GET    /api/xrpc/<nsid>?…                an XRPC query in the session's permission set
POST   /api/service-auth                 a PDS-signed service-auth token the session's set lists
GET    /clients/<set>/client-metadata.json  a permission set's OAuth client metadata
GET    /clients/<set>/oauth/callback     a permission set's token exchange
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

## Browser extensions

An extension that renders the component in its own pages (a popup, or an
extension-origin iframe on another site) signs in with its extension origin,
such as `chrome-extension://<id>`. The bridge treats it like a website: it is
accepted when `allowedOrigins` is unset, and a bridge with an allowlist lists
it there:

```ts
createAtprotoCommentsService({
  // ...
  allowedOrigins: [
    "https://blog.example",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
  ],
});
```

The session is bound to the extension origin, which no web page can forge.
The extension's pages share one origin, so a sign-in from any of them is
visible to the others through that origin's `localStorage`. Pin the extension
ID (Chrome's manifest `key`) so it stays the same across machines and
unpacked builds. Firefox gives each installation its own `moz-extension://`
UUID, so an allowlist cannot list a Firefox extension for every reader; such
an extension needs a bridge without `allowedOrigins`.

## Permission sets

Some sites need a little more of the reader's account than commenting, such
as reading their timeline. The operator can offer that to specific sites as a
permission set:

```ts
createAtprotoCommentsService({
  // ...
  permissionSets: {
    feeds: {
      // the app name the reader's PDS shows on its approval screen
      clientName: "Reader App (via comments.example)",
      // listed on the bridge's sign-in page
      description: "Read your feeds and timeline",
      // the only origins that may sign in under this set
      origins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop"],
      methods: [
        {
          nsid: "app.bsky.feed.getTimeline",
          aud: "did:web:api.bsky.app#bsky_appview",
        },
      ],
    },
  },
});
```

A listed site asks for it with `signIn({ access: "feeds" })`.

**Each set is its own OAuth client:**

- its `client_id` is `<basePath>/clients/<name>/client-metadata.json`, with its
  own `clientName` and redirect URI;
- its scope is `scope` plus an `rpc:<nsid>?aud=<aud>` scope per method, so a
  site in the set can also comment with the same login and its readers
  approve once;
- it keeps its logins and flow state in the same `stateStore` and
  `sessionStore`, under keys prefixed with `sets/<name>/`;
- it shares the default client's signing keys (`/jwks.json`).

**This keeps one site's grant away from every other site:**

- Comment sections keep the default client: the same `client_id`, scope,
  approval screen, and stored logins as without permission sets.
- The extra scopes exist only in the set's logins, and only the set's
  `origins` can sign in under it.
- The bridge records the set on the session (`ServiceSession.access`), and
  every request acts through that session's own client.

**Sign-out** revokes the login of the session's own client. Signing out of a
comment section never touches a set's login, and the other way round. Within
one client the existing rule holds: a reader signed in on two of its sites
ends both by signing out of either.

**Signing in again** on a site replaces that site's previous session, for
example when it steps up from commenting to a set:

- cookie mode deletes the previous session in the callback;
- bearer clients retire their previous token with `POST /api/session/retire`,
  which `ServiceClient.signIn` does for you.

The previous client's login stays, since other sites may be using it.

Each set's `origins` must also be in `allowedOrigins` when the deployment has
an allowlist. A set cannot list a Firefox extension, whose `moz-extension://`
UUID differs per installation (see [Browser extensions](#browser-extensions)).
Without permission sets, nothing changes.

### Reading through the bridge

A session signed in under a set calls the set's queries through
`GET /api/xrpc/<nsid>`, or `ServiceClient.query(nsid, params)`:

```ts
const { feed, cursor } = await client.query("app.bsky.feed.getTimeline", {
  limit: 30,
});
```

The bridge forwards the request to the reader's PDS, with `atproto-proxy` set
to the method's `aud`, and passes the response through. It refuses:

- anything but GET (405);
- a malformed NSID (400);
- a query outside the session's own set, and every query from a session
  without a set (403).

**Other rules:**

- The caller can't choose the upstream service: `atproto-proxy` always comes
  from config.
- The reader's `Accept-Language` is forwarded, since feeds rank by language.
- Responses carry `cache-control: no-store`.
- An upstream 401 or 403 becomes a 403 `UpstreamForbidden`, so a refused grant
  doesn't look like an expired bridge session. Upstream failures become 502.
- Reads have their own limiter, `proxyRateLimiter`, keyed by account and set
  (default: 600 per 10 minutes).

### Proving the account to another service

A set can let its sites prove which account is signed in to a service of
their own, using ATProto service auth:

```ts
permissionSets: {
  feeds: {
    // ...
    serviceAuth: [{ aud: "did:web:api.reader.example", lxm: "com.reader.classify" }],
  },
}
```

```ts
const token = await client.getServiceAuth({
  aud: "did:web:api.reader.example",
  lxm: "com.reader.classify",
});
```

**How it works:**

- `POST /api/service-auth` asks the reader's PDS
  (`com.atproto.server.getServiceAuth`) for a token valid for 60 seconds,
  signed with the account's own key.
- The receiving service verifies the token against the account's DID document
  (for example with `verifyJwt` from `@atproto/xrpc-server`), checks that
  `aud` is its own DID and `lxm` the method being called, and rate-limits on
  `iss`. The bridge holds no signing key for this.
- Each pair adds `rpc:<lxm>?aud=<aud>` to the set's scope, which is what the
  PDS checks before it signs.
- The bridge only asks for pairs the session's set lists (403 otherwise).
- Requests share `proxyRateLimiter`.

A set needs at least one entry in `methods` or `serviceAuth`.

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

## Viewer reaction state

`GET /api/viewer` answers "which of these comments has this reader already
liked or reposted", which the component needs to render filled hearts and to
avoid writing a duplicate record when someone clicks a post they liked
elsewhere.

A like is a public record pointing at the post it likes, so the question is a
backlink query. The bridge puts it to
[Constellation](https://constellation.microcosm.blue), the public backlink
index (Spacedust's sibling, already an upstream here): one
`blue.microcosm.links.getBacklinks` lookup filtered to the reader's DID
returns their like record's rkey. Public data, so the endpoint needs no grant
from the reader and adds nothing to the scopes above.

```ts
createAtprotoCommentsService({
  // ...
  constellation: "https://constellation.microcosm.blue",
});
```

That costs one lookup per post per reaction kind, so the same neighbourliness
rules as the Spacedust upstream apply:

- the component sends only posts whose **public count is non-zero** — nobody
  can be among no likers, and most replies in a comment thread have none, so
  a typical thread asks about a handful of posts rather than all of them;
- a request may name at most 100 subjects, likes and reposts together;
- lookups run at most 8 at a time;
- the reader's DID comes from their session, never the query string. This
  reports what _you_ reacted to; it is not a lookup service for other people.

An unreachable index answers `{ likes: {}, reposts: {}, unavailable: true }`
at HTTP 200. Hearts render unfilled and counts stay as the AppView reported
them — cosmetic, so it must never break the thread.

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
