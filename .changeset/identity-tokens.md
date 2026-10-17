---
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": minor
---

Issue short-lived identity tokens for other services. With the new
`identity` option, `POST /api/identity` returns an ES256 JWT naming the
signed-in reader's DID for a configured audience, and
`/identity/jwks.json` publishes the keys to verify it offline. The client
gains `getIdentityToken(audience)`. Tokens carry no ATProto permissions.
