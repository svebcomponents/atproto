---
"@svebcomponents/atproto.comments": patch
---

Rebuild the component with the upstream Next.js SSR fixes.

The generated renderer now uses `@svebcomponents/ssr` 0.8.2, which recovers
declarative shadow DOM parsed after the custom element has already upgraded and
lets client bundlers remove the server-only rendering graph. Together with
`@svebcomponents/ssr-react` 0.4.0, this preserves the server-rendered shadow
content and hydration in React Server Components and Next.js App Router.
