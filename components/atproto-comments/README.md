# @svebcomponents/atproto.comments

A hydratable web component that renders an ATProto/Bluesky post thread as blog
comments.

```sh
pnpm add @svebcomponents/atproto.comments
```

```js
import "@svebcomponents/atproto.comments";
```

```html
<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/..."
></atproto-comments>
```

Set `service` to an `@svebcomponents/atproto.bridge` deployment to enable
sign-in and replies. The component otherwise works as a read-only, client-only
custom element.

## Server rendering

Install `@svebcomponents/ssr`, import this package's `./ssr` renderer, and
register it with your host's svebcomponents integration. During asynchronous
SSR the component fetches the thread itself and serializes it for hydration.
Passing a `threadData` property skips that server fetch.

See the [repository](https://github.com/svebcomponents/atproto) for
complete SvelteKit and service examples.
