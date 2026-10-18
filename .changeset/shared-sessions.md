---
"@svebcomponents/atproto.client": minor
"@svebcomponents/atproto.comments": minor
---

Share sessions across pages of one origin. `<atproto-comments>` follows a
sign-in or sign-out made in another page or frame without a reload, and
clears the previous reader's reaction state on sign-out. `ServiceClient`
gains `onSessionChange(listener)` and an options form of its second
argument, `new ServiceClient(url, { fetch, storage })`, to keep the token
outside `localStorage`. Passing a fetch function still works.
