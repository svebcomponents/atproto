---
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": minor
---

Add permission sets: extra access the operator offers to specific sites.

- Each set is its own OAuth client, with its own `client_id`, approval-screen
  name, scope, and stored logins.
- Only the set's listed origins can sign in under it, with
  `signIn({ access: "<name>" })`.
- Sign-out revokes only the login of the session's own client.
- Signing in again replaces the site's previous session through the new
  `POST /api/session/retire`.

Without `permissionSets`, the bridge behaves exactly as before.
