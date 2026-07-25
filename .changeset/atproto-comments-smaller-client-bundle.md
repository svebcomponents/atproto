---
"@svebcomponents/atproto.comments": patch
---

Shrink the CDN / bare-`import` client bundle by 13% (93.6 kB → 81.3 kB raw,
31.8 kB → 27.8 kB gzipped) by no longer shipping Svelte's dev-only code.

The build resolved `esm-env`'s `DEV` export through its `dev-fallback` — a
runtime `process.env.NODE_ENV` check rather than a literal — so no `if (DEV)`
branch in Svelte's runtime could be eliminated, and the full dev-only error and
warning message texts ended up in `dist/client`. Fixed upstream in
`@svebcomponents/build` 0.3.3 (svebcomponents/svebcomponents#126); this is the
toolchain bump that picks it up. No source or API changes.
