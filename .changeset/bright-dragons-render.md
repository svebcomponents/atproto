---
"@svebcomponents/atproto.comments": patch
---

Require `@svebcomponents/ssr` 0.3.1 or newer for SSR consumers. This runtime recognizes component renderers across the bundled and external module instances that Vite can create, allowing SvelteKit apps to use the component without a package-specific `ssr.noExternal` entry.
