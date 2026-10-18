# @svebcomponents/atproto.client

## 0.7.0

### Minor Changes

- 0b35e4e: Add permission sets: extra access the operator offers to specific sites.

  - Each set is its own OAuth client, with its own `client_id`, approval-screen
    name, scope, and stored logins.
  - Only the set's listed origins can sign in under it, with
    `signIn({ access: "<name>" })`.
  - Sign-out revokes only the login of the session's own client.
  - Signing in again replaces the site's previous session through the new
    `POST /api/session/retire`.

  Without `permissionSets`, the bridge behaves exactly as before.

- b428c42: Render post embeds. `Comment` and `RootSummary` gain an optional `embed`
  (images and galleries, video, link cards, and quoted posts with their own
  media), produced by the new `normalizeEmbed`. The component shows them below
  the post text, collapses quoted posts that carry moderation labels unless
  `labels="show"`, and exposes `embed*` parts for styling. `RootSummary` also
  gains optional `labels`, and a labeled root's media is held behind the same
  moderation notice as a labeled reply.
- e840ef2: Let permission sets request service-auth tokens.

  - A set can list `serviceAuth` pairs (`aud`, `lxm`).
  - Its sites call `POST /api/service-auth`, or
    `ServiceClient.getServiceAuth({ aud, lxm })`, to get a short-lived token
    signed by the reader's own PDS.
  - Their backend verifies the token against the account's DID document.

- d4df4a0: Share sessions across pages of one origin. `<atproto-comments>` follows a
  sign-in or sign-out made in another page or frame without a reload, and
  clears the previous reader's reaction state on sign-out. `ServiceClient`
  gains `onSessionChange(listener)` and an options form of its second
  argument, `new ServiceClient(url, { fetch, storage })`, to keep the token
  outside `localStorage`. Passing a fetch function still works.
- b361024: Add a scoped XRPC proxy for permission sets.

  - A session signed in under a set can call that set's queries through
    `GET /api/xrpc/<nsid>`, or `ServiceClient.query(nsid, params)`.
  - `atproto-proxy` always comes from the operator's config.
  - Reads have their own rate limiter, `proxyRateLimiter`.

### Patch Changes

- 5a15b10: Keep readers signed in past the bearer token's lifetime. `ServiceClient`
  renews its token once it is past half its lifetime, before the next request,
  and the bridge's `/api/session/refresh` now accepts a token that expired
  within the new `sessionRefreshWindowSeconds` (default 7 days). Refresh
  rotates: renewing retires the previous token, so a copied token cannot be
  renewed once the reader's own client has renewed. The client measures a
  token's age by its own clock from when it received the token, renews and
  retries once on a 401, and picks up a token another page of the origin
  renewed. Previously the client never refreshed, so every reader was signed
  out an hour after signing in.

## 0.6.0

### Minor Changes

- 322a381: Show the reader's existing likes and reposts

  The component read threads from the public AppView, which never reports
  viewer state, so it only knew about reactions made in the current tab: hearts
  rendered unfilled however many times you had already liked a comment, and
  clicking one wrote a second, redundant like record. The count made it look
  worse — it rendered `likeCount + 1` for a filled heart, so once the AppView
  tallied your like the number appeared to drop back on reload.

  The bridge gains `GET /api/viewer?like=…&repost=…`, which reads the reader's
  own like/repost records from the Constellation backlink index, and the
  component adopts that as both the rendered state and the baseline its counts
  are corrected against. The index is public, so the lookup asks nothing of the
  reader: sign-in is unchanged and existing sessions keep working. The component
  only asks about posts whose public reaction count is non-zero, which keeps a
  typical thread down to a handful of lookups.

  New `constellation` option on the bridge points at a different index instance.
  `@svebcomponents/atproto.client` gains `ServiceClient#viewerReactions`, the
  `ViewerReactions` / `ViewerSubjects` types, and the `MAX_VIEWER_SUBJECTS` cap
  both sides share.

## 0.5.0

### Minor Changes

- 13cde70: Accept post URLs from any AppView frontend, not just `bsky.app`.

  `parseThreadRef` gated on `url.hostname === "bsky.app"`, so a mu.social or
  self-hosted viewer URL was rejected — even though `viewer` will happily
  _generate_ those same URLs. The input and output sides disagreed: you could
  render a thread whose "Reply on mu.social" link you could not paste back
  into `thread`.

  Parsing is now shape-only: any `https` URL matching `/profile/…/post/…`. The
  hostname was never load-bearing — it is discarded once `authority` and `rkey`
  are extracted, and the resulting `at://` URI is always resolved through the
  caller's configured AppView. Gating on it rejected unknown-but-valid viewers
  while buying no safety.

  This also reaches the bridge's `/api/comments/stream`, which validates its
  `thread` parameter through the same parser.

  Error and validation copy no longer names bsky.app: "Not a valid AT URI or
  post URL", and "thread must be an AT URI or post URL".

## 0.4.0

### Minor Changes

- 79d6687: Security and reader-privacy hardening ahead of the first announced release.

  **Session handoff is bound to the origin it was authorized for.** The sign-in
  claim nonce travels as a query parameter on a public endpoint, so it could
  never be the secret that guarded the handoff. Claims now record the origin the
  sign-in was authorized for and are only released to a matching `Origin`.

  **Requests that write to a repo require a proven origin.** A missing `Origin`
  header previously skipped the origin check entirely, so origin-bound tokens
  were unbound for any client that simply omitted the header. All mutating
  requests now require one, in both session modes.

  **Link facets are scheme-checked before becoming an `href`.** Facets are
  self-asserted and returned verbatim by the AppView, so a link facet could
  carry a `javascript:` URI and execute on the embedding page. Only `http:` and
  `https:` become links; anything else renders as plain text.

  **Signing out revokes the ATProto grant**, not just the browser session, and
  unused token sets now expire (30 days) instead of being kept forever.

  **Signed-out readers no longer contact the bridge.** The live event stream is
  gated behind the new `live` attribute (`"signed-in"` by default, plus `"all"`
  and `"off"`), and the session probe only runs when there is a session to
  restore. A reader who never signs in now makes no request to the service at
  all. Set `live="all"` to restore streaming for every reader.

  **New `allowedOrigins` service option** restricts which sites may sign in
  against a deployment. Defaults to allowing any origin, as the hosted instance
  needs.

  Also: `return` URLs are reduced to origin + path — enforced on the server, so
  it also covers the `Referer` fallback — meaning reader query strings never
  reach the service; the no-JS sign-in link carries `referrerpolicy="origin"`;
  and a `state` field labelled as a CSRF nonce that was never verified has been
  removed (the OAuth library owns that check).

## 0.3.0

### Minor Changes

- 6b1769a: Remove the unused `ServiceClient.hasToken` getter.

  Nothing consumed it, and class members are never tree-shaken, so it shipped in every bundle that touched `ServiceClient`. Callers that need to know whether a session exists should use `getSession()`, which reflects whether the token is still valid rather than merely present.

  Marked minor rather than patch because it removes a member from a published class, even though the surface was almost certainly unused outside this repo.

## 0.2.0

### Minor Changes

- 10bf336: Make the hosted auth and live-update backend the component default. Add a
  public SSE endpoint backed by one multiplexed Microcosm Spacedust connection,
  event-driven thread revalidation, and same-origin cookie sessions for
  self-hosters.

## 0.1.0

### Minor Changes

- 56c9841: Publish the initial ATProto comments packages, including component-owned
  server fetching and serialized hydration through svebcomponents SSR.
