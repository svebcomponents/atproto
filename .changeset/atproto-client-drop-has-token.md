---
"@svebcomponents/atproto.client": minor
---

Remove the unused `ServiceClient.hasToken` getter.

Nothing consumed it, and class members are never tree-shaken, so it shipped in every bundle that touched `ServiceClient`. Callers that need to know whether a session exists should use `getSession()`, which reflects whether the token is still valid rather than merely present.

Marked minor rather than patch because it removes a member from a published class, even though the surface was almost certainly unused outside this repo.
