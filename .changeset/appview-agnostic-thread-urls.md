---
"@svebcomponents/atproto.client": minor
"@svebcomponents/atproto.bridge": minor
---

Accept post URLs from any AppView frontend, not just `bsky.app`.

`parseThreadRef` gated on `url.hostname === "bsky.app"`, so a mu.social or
self-hosted viewer URL was rejected — even though `viewer` will happily
*generate* those same URLs. The input and output sides disagreed: you could
render a thread whose "Reply on mu.social" link you could not paste back
into `thread`.

Parsing is now shape-only: any `https` URL matching `/profile/…/post/…`. The
hostname was never load-bearing — it is discarded once `authority` and `rkey`
are extracted, and the resulting `at://` URI is always resolved through the
caller's configured AppView. Gating on it rejected unknown-but-valid viewers
while buying no safety.

This also reaches the bridge's `/api/comments/stream`, which validates its
`thread` parameter through the same parser.

Error and validation copy no longer names bsky.app: "Not a valid AT URI or
post URL", and "thread must be an AT URI or post URL".
