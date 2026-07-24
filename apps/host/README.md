# atproto.svebcomponents.dev

This adapter-node SvelteKit app is both the public documentation/demo site and
the hosted bridge. The bridge is mounted at `/atproto`; its OAuth client
metadata, APIs, and SSE endpoint therefore share the documentation domain.

## Production configuration

Copy `.env.example` into your host's secret/environment configuration. For the
public service:

```dotenv
SERVICE_URL=https://atproto.svebcomponents.dev
SESSION_MODE=bearer
SERVICE_DB_PATH=/data/service.db
```

Also provide a stable 32+ character `SESSION_SECRET` and one or more
newline-separated PKCS#8 keys in `OAUTH_PRIVATE_KEYS`. Mount `/data` as a
persistent volume.

Build and run the long-lived Node server:

```sh
pnpm --filter atproto-host build
node apps/host/build
```

The reverse proxy must:

- preserve streaming responses and disable buffering for
  `/atproto/api/comments/stream`;
- allow connection lifetimes longer than the 15-second heartbeat;
- forward web requests with their `Origin` header intact;
- apply per-IP SSE connection admission and OAuth-start rate limiting;
- terminate TLS for the stable `SERVICE_URL`.

Do not deploy the combined app to a request-duration-limited function. OAuth
uses persistent SQLite state and live events use long-lived SSE plus an
upstream WebSocket.

For a same-origin private deployment, set `SESSION_MODE=cookie` and point the
component at `service="/atproto"`.
