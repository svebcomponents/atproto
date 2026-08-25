# @svebcomponents/atproto.bridge

## 0.5.0

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

### Patch Changes

- Updated dependencies [322a381]
  - @svebcomponents/atproto.client@0.6.0

## 0.4.0

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

- 0a5c789: Render the bridge's pages with Svelte SSR and add typed OAuth sign-in page
  customization for self-hosted deployments. `oauthPage` can set the visible
  title, brand name/logo/home link, accent color, privacy link, and support link;
  relative URLs resolve against `publicUrl`.

  Hosts that need complete markup control can pass an async or synchronous
  `renderSignInPage` option. It replaces only the handle-entry screen: OAuth
  callbacks and browser session handoff remain owned by the bridge.

- 1a06715: The bridge's own pages now use the documentation site's design, and can carry
  a short project pitch.

  New `productUrl` option. When set, the bridge's pages show a brand header and
  the sign-in page gains a footer note pointing at the project. `privacyUrl` is
  linked from that header rather than from under the card. Unset by default, so a self-hosted bridge does not advertise
  someone else's project on its own sign-in screen — the branding and the pitch
  are opt-in together.

  On viewports wide enough for it, the sign-in page lays out as two columns —
  the explanation on the left, the form on the right — rather than a narrow
  column centred in empty space. Narrower viewports keep a single column at a
  readable measure, stacking explanation, then form, then pitch.

  The shared page shell now uses the docs site's palette, its Georgia display
  face for headings, and the same Inter-with-system-fallback body stack. No
  webfont is fetched: the docs site relies on the same fallbacks, and pulling a
  font from a third party onto a consent screen would undercut the point. The
  brand mark is inlined rather than linked, so the page renders standalone from
  any origin.

- 1a06715: Sign-in page: accurate consent copy, a privacy link, and a real layout.

  The page said the reader was approving "posting replies on your behalf for
  <site>". Neither half was true of the authorization. ATProto OAuth scopes are
  collection + action, so the grant is `repo:app.bsky.feed.post?action=create` —
  create any post, not only replies — plus create/delete on likes and reposts.
  And the grant is keyed by DID, so it spans every site using the bridge rather
  than the one named. Replies-only is a restraint the bridge imposes on itself
  in `replyValidation`; it is not a limit of the authorization, and anyone
  holding the token set has the broader capability. The page now says what is
  actually granted, and notes that the provider will show the exact scopes.

  New `privacyUrl` option (absolute, or a path resolved against `publicUrl`)
  links the operator's privacy policy from the sign-in footer. Omitted by
  default; a public deployment asking strangers for posting authority should
  set it.

  The page itself was the unstyled default — an oversized heading in a 24rem
  column with no container. It is now a proper card: the requesting origin
  called out in its own labelled block (it is the security-relevant detail), a
  plain list of what approving allows, and light/dark, mobile and focus states
  that were not really designed before.

### Patch Changes

- 13cde70: Document the `appView` option, which was configurable but undocumented, and
  stop the sign-in page's promo copy from naming one AppView's brand — readers
  sign in with an ATmosphere identity, whichever AppView the site reads from.

  The 300-grapheme reply limit is now attributed to the `app.bsky.feed.post`
  lexicon's `maxGraphemes` rather than to Bluesky.

- Updated dependencies [13cde70]
  - @svebcomponents/atproto.client@0.5.0

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
