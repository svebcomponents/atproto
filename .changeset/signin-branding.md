---
"@svebcomponents/atproto.bridge": minor
---

The bridge's own pages now use the documentation site's design, and can carry
a short project pitch.

New `productUrl` option. When set, the sign-in, callback, error and success
pages show a brand header and the sign-in page gains a footer note pointing at
the project. Unset by default, so a self-hosted bridge does not advertise
someone else's project on its own sign-in screen — the branding and the pitch
are opt-in together.

The shared page shell now uses the docs site's palette, its Georgia display
face for headings, and the same Inter-with-system-fallback body stack. No
webfont is fetched: the docs site relies on the same fallbacks, and pulling a
font from a third party onto a consent screen would undercut the point. The
brand mark is inlined rather than linked, so the page renders standalone from
any origin.
