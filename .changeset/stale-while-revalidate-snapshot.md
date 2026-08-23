---
"@svebcomponents/atproto.comments": minor
---

Fresh-by-default snapshots: "not live" no longer means "stale".

A component mounted with a preloaded `threadData` snapshot used to render it
indefinitely unless the viewer signed in and the live stream connected. The
component now runs one background revalidation against the public AppView on
mount when the snapshot is older than the new `stale-time` attribute
(default 60 000 ms; `Infinity` opts out). The refresh is a direct client →
AppView read: signed-out visitors get current comments while still making no
request to any bridge.

The SSR prefetch stamps the new `fetched-at` property automatically so real-time
server rendering skips the redundant fetch. Hosts supplying their own
`threadData` can pass `fetched-at` too; leaving it out counts as an unknown age,
which is treated as stale — fresh content by default.
