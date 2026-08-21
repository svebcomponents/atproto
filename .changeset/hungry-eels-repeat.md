---
"@svebcomponents/atproto.comments": minor
---

Move the `@svebcomponents/ssr` peer range to `^0.8.0`, the runtime this package
is now built and tested against.

0.8.0 removes the `@svebcomponents/ssr/enable-async` entry point that hosts had
to import by hand to turn on Svelte's async server runtime. A component package
built with `compilerOptions.experimental.async` now enables it from its own
generated `/ssr` entry. This component renders synchronously — its SSR
preparation hook returns early when the host supplies `threadData` — so its
generated renderer is unchanged from the one 0.7 produced and consumers have
nothing to change beyond the peer bump.

If your host imports `@svebcomponents/ssr/enable-async` for some other
component, delete the import and rebuild that package.
