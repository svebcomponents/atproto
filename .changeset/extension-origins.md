---
"@svebcomponents/atproto.bridge": minor
---

Add an `extensionOrigins` option that lets listed browser extensions
(`chrome-extension://<id>`, `moz-extension://<uuid>`,
`safari-web-extension://<uuid>`) sign in and hold an origin-bound bearer
session, the same way a website does. Extensions are never accepted unless
listed, including on a bridge without `allowedOrigins`.
