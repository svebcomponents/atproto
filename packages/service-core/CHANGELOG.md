# @svebcomponents/atproto.bridge

## 0.3.0

### Minor Changes

- 79d6687: Operational counters, and a public stats endpoint.

  The bridge now counts how much it is used: sign-ins, replies, reactions,
  live-stream connections and rate-limit hits, aggregated per embedding origin
  per UTC day. `GET {basePath}/api/stats` serves service-wide totals plus live
  gauges (threads watched, subscribers connected) to anyone, cached for 30
  seconds, and `service.stats()` returns the same for a host that wants to
  render it itself.

  The unit of measurement is deliberately the embedding **site**, not the
  reader. A web origin identifies a website, not a person, so this answers the
  operator's questions — how many sites, is it coping, is anyone hammering it —
  without keeping anything that describes a visitor. No IP address, user agent,
  thread, per-reader row, or timestamp finer than the UTC day is recorded, and
  there is deliberately no unique-visitor figure, since counting distinct people
  requires exactly the per-person identifier this service avoids. The public
  response carries totals only and never the origins themselves.

  Counters buffer in memory and flush as deltas, so a busy thread costs a map
  lookup rather than a write. Configure `metricsStore` for persistence
  (`metricsFlushIntervalMs` to tune); the default is in-memory and resets with
  the process. Recording never throws into a request path.

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

### Patch Changes

- Updated dependencies [79d6687]
  - @svebcomponents/atproto.client@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [6b1769a]
  - @svebcomponents/atproto.client@0.3.0

## 0.2.0

### Minor Changes

- 10bf336: Make the hosted auth and live-update backend the component default. Add a
  public SSE endpoint backed by one multiplexed Microcosm Spacedust connection,
  event-driven thread revalidation, and same-origin cookie sessions for
  self-hosters.

### Patch Changes

- Updated dependencies [10bf336]
  - @svebcomponents/atproto.client@0.2.0

## 0.1.0

### Minor Changes

- 56c9841: Publish the initial ATProto comments packages, including component-owned
  server fetching and serialized hydration through svebcomponents SSR.

### Patch Changes

- Updated dependencies [56c9841]
  - @svebcomponents/atproto.client@0.1.0
