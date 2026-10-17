---
"@svebcomponents/atproto.client": minor
"@svebcomponents/atproto.comments": minor
---

Render post embeds. `Comment` and `RootSummary` gain an optional `embed`
(images and galleries, video, link cards, and quoted posts with their own
media), produced by the new `normalizeEmbed`. The component shows them below
the post text, collapses quoted posts that carry moderation labels unless
`labels="show"`, and exposes `embed*` parts for styling.
