# @svebcomponents/atproto.client

Framework-neutral ATProto helpers used by `atproto-comments`: thread reference
parsing, AppView fetching, comment-tree normalization, rich-text segmentation,
sorting, viewer URLs, and the browser client for an
`@svebcomponents/atproto.bridge` service.

Defaults target Bluesky — `public.api.bsky.app` for reads, `bsky.app` for
outbound links — and every function taking an `appView` or `viewer` option
accepts any substitute.

```sh
pnpm add @svebcomponents/atproto.client
```

```ts
import {
  DEFAULT_SERVICE_URL,
  ServiceClient,
  fetchCommentTree,
} from "@svebcomponents/atproto.client";

// an at:// URI, or a post URL from any viewer using the
// `/profile/…/post/…` scheme (bsky.app, mu.social, self-hosted)
const tree = await fetchCommentTree(
  "https://bsky.app/profile/bsky.app/post/...",
);

const hosted = new ServiceClient(); // DEFAULT_SERVICE_URL
const streamUrl = hosted.commentsStreamUrl(tree.root.uri);
```

`DEFAULT_SERVICE_URL` is
`https://atproto.svebcomponents.dev/atproto`. `ServiceClient` transparently
supports the hosted bridge's origin-bound bearer sessions and same-origin
self-hosted cookie sessions.

See [atproto.svebcomponents.dev](https://atproto.svebcomponents.dev/) for the
component and self-hosting documentation.
