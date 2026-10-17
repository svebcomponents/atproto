---
"@svebcomponents/atproto.bridge": minor
"@svebcomponents/atproto.client": minor
"@svebcomponents/atproto.comments": minor
---

Let readers read their own feeds through the bridge, and share sessions
across pages of one origin.

- Bridge: a new, opt-in `feeds` option adds `GET /api/feed` (a feed
  generator, such as For You) and `GET /api/timeline` (Following). They proxy
  through the reader's PDS to the AppView. A sign-in asks for feed access
  only when the client requests `access=feeds`.
- Client: `signIn({ access: "feeds" })`, `getFeed()`, and `getTimeline()`;
  a `storage` option for keeping the token outside `localStorage`; and
  `onSessionChange()` for sign-ins and sign-outs in other pages of the origin.
- Component: follows sign-ins and sign-outs from other pages and frames of
  the same origin without a reload.
