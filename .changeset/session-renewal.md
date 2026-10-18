---
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": patch
---

Keep readers signed in past the bearer token's lifetime. `ServiceClient`
renews its token once it is past half its lifetime, before the next request,
and the bridge's `/api/session/refresh` now accepts a token that expired
within the new `sessionRefreshWindowSeconds` (default 7 days). Refresh
rotates: renewing retires the previous token, so a copied token cannot be
renewed once the reader's own client has renewed. The client measures a
token's age by its own clock from when it received the token, renews and
retries once on a 401, and picks up a token another page of the origin
renewed. Previously the client never refreshed, so every reader was signed
out an hour after signing in.
