# @svebcomponents/atproto.client

Framework-neutral ATProto helpers used by `atproto-comments`: thread reference
parsing, AppView fetching, comment-tree normalization, rich-text segmentation,
sorting, viewer URLs, and the browser client for an
`@svebcomponents/atproto.bridge` service.

```sh
pnpm add @svebcomponents/atproto.client
```

```ts
import {
  DEFAULT_SERVICE_URL,
  ServiceClient,
  fetchCommentTree,
} from "@svebcomponents/atproto.client";

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
