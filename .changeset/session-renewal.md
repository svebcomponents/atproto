---
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": patch
---

Keep readers signed in past the bearer token's lifetime. `ServiceClient`
renews its token once it is past half its lifetime, before the next request,
and the bridge's `/api/session/refresh` now accepts a token that expired
within the new `sessionRefreshWindowSeconds` (default 30 days). Previously
the client never refreshed, so every reader was signed out an hour after
signing in.
