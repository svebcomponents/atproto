---
"@svebcomponents/atproto.bridge": minor
---

Operational counters, and a public stats endpoint.

The bridge now counts how much it is used: sign-ins, replies, reactions,
live-stream connections and rate-limit hits, aggregated per embedding origin
per UTC day. `GET {basePath}/api/stats` serves service-wide totals plus live
gauges (threads watched, subscribers connected) to anyone, cached for 30
seconds, and `service.stats()` returns the same for a host that wants to
render it itself.

The unit of measurement is deliberately the embedding **site**, not the
reader. A web origin identifies a website, not a person, so this answers the
operator's questions — how many sites, is it coping, is anyone hammering it —
without keeping anything that describes a visitor. No IP address, user agent,
thread, per-reader row, or timestamp finer than the UTC day is recorded, and
there is deliberately no unique-visitor figure, since counting distinct people
requires exactly the per-person identifier this service avoids. The public
response carries totals only and never the origins themselves.

Counters buffer in memory and flush as deltas, so a busy thread costs a map
lookup rather than a write. Configure `metricsStore` for persistence
(`metricsFlushIntervalMs` to tune); the default is in-memory and resets with
the process. Recording never throws into a request path.
