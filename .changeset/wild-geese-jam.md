---
"@svebcomponents/atproto.comments": minor
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": minor
---

Show the reader's existing likes and reposts

The component read threads from the public AppView, which never reports
viewer state, so it only knew about reactions made in the current tab: hearts
rendered unfilled however many times you had already liked a comment, and
clicking one wrote a second, redundant like record. The count made it look
worse — it rendered `likeCount + 1` for a filled heart, so once the AppView
tallied your like the number appeared to drop back on reload.

The bridge gains `GET /api/viewer?like=…&repost=…`, which reads the reader's
own like/repost records from the Constellation backlink index, and the
component adopts that as both the rendered state and the baseline its counts
are corrected against. The index is public, so the lookup asks nothing of the
reader: sign-in is unchanged and existing sessions keep working. The component
only asks about posts whose public reaction count is non-zero, which keeps a
typical thread down to a handful of lookups.

New `constellation` option on the bridge points at a different index instance.
`@svebcomponents/atproto.client` gains `ServiceClient#viewerReactions`, the
`ViewerReactions` / `ViewerSubjects` types, and the `MAX_VIEWER_SUBJECTS` cap
both sides share.
