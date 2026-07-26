---
"@svebcomponents/atproto.comments": patch
---

Drop the vendored `HydrationHost` and use the one `@svebcomponents/ssr` ships.

The local copy existed only to avoid destructuring `$props()`, which under an
earlier `@svebcomponents/ssr` produced writable prop signals with no parent
effect and broke hydration before the user's component mounted. On the current
pin (`svelte` 5.56.4, `@svebcomponents/ssr` 0.3.1) that no longer reproduces:
the SSR'd shadow DOM is still hydrated in place, with `experimental.async` and
the async SSR wrapper both on or both off. Removing the vendored copy also
removes the build-config aliasing that kept every build variant pointed at it,
so the component now tracks upstream's host automatically. No API change.
