---
"@svebcomponents/atproto.comments": minor
---

Add progressively enhanced reply, like, and repost controls that remain
functional without client-side JavaScript when the component uses a
same-origin, cookie-mode service.

The new `pageUrl` property supplies the embedding page's canonical URL so a
no-JavaScript sign-in flow can return to the page after authentication. Reply,
like, and repost actions use native HTML forms as their baseline while
retaining the existing client-enhanced experience when JavaScript is
available.

This corrective release documents functionality that was included in 0.2.2
without a corresponding Changeset.
