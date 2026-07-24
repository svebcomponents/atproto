# @svebcomponents/atproto.bridge

The framework-neutral backend for `@svebcomponents/atproto.comments`. It
handles narrowly scoped ATProto OAuth, posts replies through the reader's PDS,
and proxies live reply signals from Microcosm Spacedust to browser SSE clients.
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

The endpoint also accepts a bsky.app post URL.

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
