---
"@svebcomponents/atproto.bridge": minor
---

Render the bridge's pages with Svelte SSR and add typed OAuth sign-in page
customization for self-hosted deployments. `oauthPage` can set the visible
title, brand name/logo/home link, accent color, privacy link, and support link;
relative URLs resolve against `publicUrl`.

Hosts that need complete markup control can pass an async or synchronous
`renderSignInPage` option. It replaces only the handle-entry screen: OAuth
callbacks and browser session handoff remain owned by the bridge.
