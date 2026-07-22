# @svebcomponents/atproto.client

Framework-neutral ATProto helpers used by `atproto-comments`: thread reference
parsing, AppView fetching, comment-tree normalization, rich-text segmentation,
sorting, viewer URLs, and the browser client for an
`@svebcomponents/atproto.bridge` service.

```sh
pnpm add @svebcomponents/atproto.client
```

```ts
import { fetchCommentTree } from "@svebcomponents/atproto.client";

const tree = await fetchCommentTree(
  "https://bsky.app/profile/bsky.app/post/...",
);
```

See the [repository](https://github.com/svebcomponents/atproto-comments) for
the full API and examples.
