---
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": minor
---

Add a scoped XRPC proxy for permission sets.

- A session signed in under a set can call that set's queries through
  `GET /api/xrpc/<nsid>`, or `ServiceClient.query(nsid, params)`.
- `atproto-proxy` always comes from the operator's config.
- Reads have their own rate limiter, `proxyRateLimiter`.
