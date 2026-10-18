---
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": minor
---

Let permission sets request service-auth tokens.

- A set can list `serviceAuth` pairs (`aud`, `lxm`).
- Its sites call `POST /api/service-auth`, or
  `ServiceClient.getServiceAuth({ aud, lxm })`, to get a short-lived token
  signed by the reader's own PDS.
- Their backend verifies the token against the account's DID document.
