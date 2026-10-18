---
"@svebcomponents/atproto.bridge": minor
---

Accept browser-extension origins (`chrome-extension://<id>`,
`moz-extension://<uuid>`, `safari-web-extension://<uuid>`) like websites. An
extension's pages can sign in and hold an origin-bound bearer session. A
bridge without `allowedOrigins` accepts them; a bridge with an allowlist
accepts the extensions listed in it.
