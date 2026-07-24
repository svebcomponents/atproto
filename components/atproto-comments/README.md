# @svebcomponents/atproto.comments

A hydratable web component that renders an ATProto/Bluesky post thread as a
live comment section.

Four tiers, in order of how much you want to set up. Each one builds on the
last — self-hosting the backend is a switch you can flip from any of them.

## 1. CDN — paste two tags, no install

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@svebcomponents/atproto.comments"
></script>

<atproto-comments
  thread="https://bsky.app/profile/bsky.app/post/..."
></atproto-comments>
```

For a static site, CMS, or anywhere you can only paste HTML. No bundler, no
`node_modules`. jsDelivr mirrors whatever's on npm, so a version pin
(`@svebcomponents/atproto.comments@0.2.0`) works the same way.

## 2. npm — bundled into your app

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

Same markup, served from your own build instead of a CDN — useful once you
want the component tree-shaken and versioned alongside the rest of your
dependencies.

## 3. SSR (server-rendered, hydrated in place)

Install `@svebcomponents/ssr`, import this package's `./ssr` renderer, and
register it with your host's svebcomponents integration. During asynchronous
SSR the component fetches the thread and serializes it for hydration, so the
first paint already has comments instead of the loading skeleton. Passing
`threadData` supplies that snapshot explicitly instead.

SvelteKit is supported today. Nuxt, Astro, Next.js, and SolidStart
integrations are planned.

## 4. Self-hosted backend

All three tiers above use the free hosted backend
(`https://atproto.svebcomponents.dev/atproto`) for OAuth, posting, and live
events by default. Set the `service` property to point at your own
deployment instead — see [Self-hosting](#self-hosting) below. This is
independent of which tier you're on: even the plain CDN drop-in can point
`service` at a self-hosted backend.

That covers the complete hosted setup at tiers 1–2. Public thread reads go
directly to the public AppView, and ATProto OAuth credentials never enter the
browser.

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

| Property    | Default        | Description                                             |
| ----------- | -------------- | ------------------------------------------------------- |
| `thread`    | —              | AT URI or bsky.app post URL                             |
| `service`   | hosted         | OAuth, posting, and SSE bridge URL                      |
| `readonly`  | `false`        | hide sign-in and in-page replies                        |
| `show-root` | `false`        | render the discussion root's own post above the replies |
| `max-depth` | `6`            | maximum nested depth                                    |
| `sort`      | `oldest`       | `oldest`, `newest`, or `likes`                          |
| `labels`    | `collapse`     | `hide`, `collapse`, or `show`                           |
| `viewer`    | bsky.app       | outbound profile/post viewer                            |
| `appview`   | public AppView | public thread-read endpoint                             |

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

See [atproto.svebcomponents.dev](https://atproto.svebcomponents.dev/) for the
full reference and live demo.
