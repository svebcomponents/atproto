# @svebcomponents/atproto.comments

A hydratable web component that renders an ATProto/Bluesky post thread as a
live comment section.

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

That is the complete hosted setup. By default, the component uses
`https://atproto.svebcomponents.dev/atproto` for live events, sign-in, and
posting. Public thread reads still go directly to the public AppView, and
ATProto OAuth credentials never enter the browser.

## Live updates

The component does not poll or use a time-based stale interval. It renders its
initial snapshot, opens one hosted SSE stream, and refreshes the thread:

- once when the stream reports that its Spacedust upstream is connected;
- when a newly created reply event arrives;
- after a reconnect or a hidden tab becomes visible again.

Events are coalesced and a newly posted URI is retried briefly while the public
AppView indexes it. A failed background refresh leaves the current comments
visible.

Call `element.revalidate()` to request a manual refresh. Concurrent refreshes
for the same thread are deduplicated.

## Self-hosting

The `service` property is the single backend switch. It moves OAuth, posting,
and SSE together:

```html
<atproto-comments
  thread="at://did:plc:.../app.bsky.feed.post/..."
  service="/atproto"
></atproto-comments>
```

A same-origin `@svebcomponents/atproto.bridge` deployment can use an HttpOnly
cookie with `sessionMode: "cookie"`. A cross-origin deployment should use the
default origin-bound bearer session. Set `service=""` for a read-only
component with no live backend, or use `readonly` to hide posting while keeping
live updates.

## Properties

| Property    | Default        | Description                        |
| ----------- | -------------- | ---------------------------------- |
| `thread`    | —              | AT URI or bsky.app post URL        |
| `service`   | hosted         | OAuth, posting, and SSE bridge URL |
| `readonly`  | `false`        | hide sign-in and in-page replies   |
| `max-depth` | `6`            | maximum nested depth               |
| `sort`      | `oldest`       | `oldest`, `newest`, or `likes`     |
| `labels`    | `collapse`     | `hide`, `collapse`, or `show`      |
| `viewer`    | bsky.app       | outbound profile/post viewer       |
| `appview`   | public AppView | public thread-read endpoint        |

`threadData` is a JavaScript-only `CommentTree` property for a preloaded
snapshot.

## Events

- `atproto-comments:loaded`
- `atproto-comments:revalidated`
- `atproto-comments:comment`
- `atproto-comments:live-status`
- `atproto-comments:signed-in`
- `atproto-comments:posted`
- `atproto-comments:error`

## Server rendering

Install `@svebcomponents/ssr`, import this package's `./ssr` renderer, and
register it with your host's svebcomponents integration. During asynchronous
SSR the component fetches the thread and serializes it for hydration. Passing
`threadData` supplies that snapshot explicitly.

See [atproto.svebcomponents.dev](https://atproto.svebcomponents.dev/) for the
full reference and live demo.
