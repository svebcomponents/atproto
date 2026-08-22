---
"@svebcomponents/atproto.comments": minor
"@svebcomponents/atproto.client": minor
"@svebcomponents/atproto.bridge": minor
---

Security and reader-privacy hardening ahead of the first announced release.

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

Also: `return` URLs are reduced to origin + path so query strings never reach
the service, sign-in links and no-JS forms carry `referrerpolicy="origin"`,
and a `state` field labelled as a CSRF nonce that was never verified has been
removed (the OAuth library owns that check).
