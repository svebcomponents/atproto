# Hosted OAuth / Posting Service

Date: 2026-07-06

The service is an **auth + posting bridge**: it signs users in with their ATProto identity, holds their OAuth tokens server-side, and creates `app.bsky.feed.post` replies in *their* repo on request. It stores no comment content and is never in the read path (MVP).

It ships in two forms: **our hosted instance** (the convenience product) and **self-hostable OSS** (see [Self-hosting](#self-hosting) below). The design keeps both identical — the hosted instance is just a deployment of the open code.

## Client type & OAuth mechanics

- **Confidential client** (BFF pattern — the pattern the ATProto docs recommend for web apps): ATProto access/refresh tokens live only server-side, keyed by a session. The browser component never sees them.
- Implementation: **`@atproto/oauth-client-node`**. Do not hand-roll PAR + PKCE + DPoP + nonce juggling; the SDK handles it and tracks spec evolution.
- **Client metadata document** served by the service itself (the URL *is* the `client_id`), e.g. `https://comments.example.com/oauth/client-metadata.json`:
  - `client_id`, `redirect_uris` (`…/oauth/callback`), `grant_types`, `scope`,
  - `token_endpoint_auth_method: "private_key_jwt"` + `jwks_uri` (ES256 signing key → confidential client → longer-lived refresh grants),
  - `dpop_bound_access_tokens: true`.
- Keys: one ES256 keypair for client auth, rotated via `jwks_uri`; separate HMAC/EdDSA key for signing our own session tokens.

### Scopes (granular, shipped as of 2026)

```
atproto
repo:app.bsky.feed.post?action=create
rpc:app.bsky.actor.getProfile?aud=did:web:api.bsky.app#bsky_appview
```

- Create-only on `app.bsky.feed.post`: we can post replies but not update/delete the user's posts. The consent screen reflects exactly that — a trust win over `transition:generic`-era full access.
- `getProfile` for handle/avatar in the signed-in chrome. (Alternative: read profile from the public AppView unauthenticated — then even this scope can be dropped. Try that first; keep the scope only if we need auth'd reads.)
- Later, liking from the page adds `repo:app.bsky.feed.like?action=create`. Adding a scope later forces re-consent — acceptable.
- Watch **permission sets**: when a suitable set covering "post + basic profile" exists, prefer it for a friendlier consent screen.

## The embedded-auth problem (the crux)

The component runs on `someblog.com`; the service is `comments.example.com`. Browsers block third-party cookies, so a service session cookie is invisible to `fetch()` from the blog page. Cookie-based BFF alone does not work for an embedded widget.

### Chosen design: popup + postMessage + service session token

```
[blog page]                         [popup: comments.example.com]
component ── window.open ──────────► /oauth/start?origin=https://someblog.com
                                       │  resolve handle → PDS, PAR, redirect
                                       ▼
                                    user's PDS authorization screen
                                       │  approve (scoped consent)
                                       ▼
                                    /oauth/callback
                                       │  token exchange (DPoP, server-side)
                                       │  create service session, mint session JWT
                                       ▼
component ◄─ postMessage({token}) ── success page (targetOrigin = origin param)
    │
    ├─ stores token: memory + localStorage (per service+origin key)
    └─ API calls: Authorization: Bearer <session JWT>
```

Design details:

- **`origin` is a first-class parameter**: validated at `/oauth/start`, carried through OAuth `state`, and used as the *exact* `targetOrigin` in `postMessage`. The token is **bound to that origin** (claim in the JWT); a token minted for `someblog.com` is rejected if replayed with `Origin: evil.com`. CORS on the API echoes only the token's bound origin.
- **Session JWT contents**: `sub` (DID), `aud` (service), `origin`, `sid` (server session id), short `exp` (~1h). Refresh: `POST /api/session/refresh` rotates it while the server-side ATProto session (refresh token) stays valid. Server session revocable at any time (delete row).
- **Why bearer-in-localStorage is acceptable here**: the threat is XSS on the *host blog*. Mitigations: the token only permits "post a reply as this user via our service" (not ATProto account access), short TTL, origin binding, server-side revocation, and rate limits. The alternative (iframe + Storage Access API) has worse UX and browser variance; partitioned cookies (CHIPS) don't give the component readable auth state. Popup+postMessage is what the industry converged on for embedded auth.
- **Popup-blocked fallback**: full-page redirect flow with `returnTo` back to the blog URL + `#fragment` token handoff (fragment never hits servers/logs), component picks it up on load and removes it from history. Slightly worse; only a fallback.
- `GET /api/session` returns `{ did, handle, avatar }` for valid tokens → component chrome.

### Sign-in UX inside the popup

`/oauth/start` without a `handle` parameter shows a minimal service-branded page: handle input (with typeahead via `com.atproto.identity.resolveHandle`), "we'll send you to your account provider to approve", then redirects to the user's PDS. Users on third-party PDSes work automatically — resolution is per-user.

## API surface

```
GET  /oauth/client-metadata.json    OAuth client metadata (client_id URL)
GET  /oauth/jwks.json               public keys
GET  /oauth/start?origin=…&handle=… begin flow (popup entry)
GET  /oauth/callback                token exchange → success page → postMessage
GET  /api/session                   bearer → { did, handle, avatar } | 401
POST /api/session/refresh           rotate session JWT
POST /api/session/logout            revoke server session
POST /api/reply                     bearer → create reply post
```

`POST /api/reply` body/response (matches the notes' sketch):

```jsonc
// request
{ "root": {"uri": "at://…", "cid": "bafy…"},
  "parent": {"uri": "at://…", "cid": "bafy…"},
  "text": "Great post!" }
// response
{ "uri": "at://did:…/app.bsky.feed.post/…", "cid": "bafy…" }
```

Server-side on `/api/reply`:

1. Validate session JWT (sig, exp, origin binding vs request `Origin`).
2. Validate text: non-empty, ≤300 graphemes, strip nulls; compute facets? **No** — v1 posts plain text (facet detection for URLs/mentions can be added server-side later; keep v1 dumb and predictable).
3. Verify `root`/`parent` are well-formed AT URIs with cids. Optionally verify the parent exists via AppView (cheap sanity check, better error messages).
4. Rate-limit check (below).
5. `com.atproto.repo.createRecord` on the user's PDS with the stored DPoP-bound tokens (`record.$type = app.bsky.feed.post`, `reply: {root, parent}`, `createdAt`, `langs` from request hint).
6. Return `{uri, cid}`.

## Storage

SQLite (libsql/better-sqlite3) in MVP — one small VM, no ops. Tables:

- `oauth_state` — `@atproto/oauth-client-node` StateStore (short-lived, PAR/PKCE/DPoP state).
- `oauth_session` — SessionStore: DID → tokens (encrypted at rest with a service key), PDS URL, scopes.
- `session` — our sessions: `sid`, DID, origin, created/last-seen, revoked flag.
- `rate_limit` — counters (or in-memory if single instance).
- (Phase 4) `site` — registered sites: origin allowlist, moderation prefs, owner DID.

The oauth-client-node store interfaces are tiny; wrapping SQLite takes an afternoon. Postgres swap later if/when the service is extracted.

## Abuse & safety

- **Rate limits**: per-DID (e.g. 10 replies/10min) and per-IP on auth start (popup spam). 429 with `Retry-After`; component surfaces it politely.
- **No open relay**: v1 only creates *reply* posts (root+parent required) — the service cannot be used to spam top-level posts.
- **Origin policy**: MVP allows any origin (token-bound, rate-limited); Phase 4 adds per-site registration/allowlists if abuse appears. Registration also unlocks site-owner moderation prefs.
- **UX honesty**: composer states the comment becomes a public Bluesky post from the user's account — repeated in the consent screen language.
- **Privacy**: log DIDs + timestamps for rate limiting only; never log comment text bodies; no analytics on commenters.
- **Key/secret handling**: signing keys via env/secret store; ATProto refresh tokens encrypted at rest; session JWTs short-lived.

## Self-hosting

Self-hosting is a first-class goal, and it shapes one architectural rule: **all service logic lives in `packages/service-core`; `apps/web` only mounts it.** Then there are three self-host tiers, cheapest first:

1. **Mount into your own SvelteKit app** (the sweet spot): `service-core` exposes its endpoints as standard **`(request: Request) => Response` fetch handlers** plus a small config object (signing keys, DB path, service origin). A SvelteKit blog adds one catch-all route (`src/routes/atproto/[...path]/+server.ts`) that delegates to `service-core`. Because fetch handlers are framework-agnostic, the same mount works in Astro endpoints, Hono, Express (via adapter), Bun — anywhere Request/Response exists and the storage driver runs.
2. **Deploy the reference app**: run `apps/web` (or a stripped `apps/service` variant if demand appears) on Fly/Railway/VPS. Full service, no code written.
3. **Use our hosted instance**: set `service="https://comments.example.com"` and done.

Why tier 1 matters beyond convenience: a blog that mounts the service **on its own origin** makes the whole auth flow first-party — no cross-origin token handoff needed, though the popup+token flow still works unchanged and keeps the component logic uniform. Each self-hosted deployment serves its own `client-metadata.json` under its own origin, so it *is* its own ATProto OAuth client automatically — decentralized client registration is exactly what atproto OAuth was designed for. Users' consent screens then show the blog's domain rather than a third party, which is arguably the best trust story of all.

Implications for `service-core`'s design (cheap to honor from day one):

- No SvelteKit imports — Request/Response + injected config only.
- Storage behind a minimal driver interface (`StateStore`/`SessionStore`/`RateLimitStore`); SQLite driver ships first, others can follow.
- Keys/secrets passed in as config, not read from env inside the package.
- The component's `service` attribute accepts any base URL, including a same-origin path like `service="/atproto"`.

## Deployment

- SvelteKit `adapter-node` (replace template's `adapter-auto`) on a persistent-disk host (Fly.io / Railway / small VPS) — SQLite needs a disk, OAuth needs stable HTTPS origin. Netlify (used by the svebcomponents docs) is fine for docs but wrong for this service (functions + no disk).
- Single instance is plenty for MVP; the session model doesn't preclude horizontal scaling later (SQLite → libsql server / Postgres).
- Local dev: ATProto OAuth requires a public HTTPS client_id in production but supports a **`http://localhost` loopback client mode** for development — document the dev loop (also useful for component contributors without service credentials).

## Testing

- Unit: session JWT mint/verify (origin binding, expiry), rate limiter, reply validation.
- Integration: mock PDS (tiny fixture server) → full popup-flow token exchange with `oauth-client-node` pointed at it; `POST /api/reply` → assert `createRecord` payload shape.
- Manual/e2e: a real test account on bsky.social against the deployed staging service — the OAuth dance has too many moving parts (PAR, DPoP nonces) to trust mocks alone.
