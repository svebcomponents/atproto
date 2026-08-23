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

Install `@svebcomponents/ssr`, add its Vite plugin, and import this package's
`./ssr` entry once on the server:

```ts
// hooks.server.ts
import "@svebcomponents/atproto.comments/ssr";
```

The renderer knows its own tag and registers itself, so there is nothing to
wire up by hand. During asynchronous SSR the component fetches the thread and
serializes it for hydration, so the first paint already has comments instead of
the loading skeleton. Passing `threadData` supplies that snapshot explicitly
instead.

Host adapters ship upstream for SvelteKit, React 19, Vue 3, and Astro
(`@svebcomponents/ssr*`); Nuxt and SolidStart integrations are still planned.

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
| `live`      | `signed-in`    | who gets live updates: `signed-in`, `all`, or `off`     |
| `show-root` | `false`        | render the discussion root's own post above the replies |
| `max-depth` | `6`            | maximum nested depth                                    |
| `sort`      | `oldest`       | `oldest`, `newest`, or `likes`                          |
| `labels`    | `collapse`     | `hide`, `collapse`, or `show`                           |
| `viewer`    | bsky.app       | outbound profile/post viewer                            |
| `appview`   | public AppView | public thread-read endpoint                             |
| `page-url`  | —              | embedding page's canonical URL; enables no-JS sign-in on a same-origin cookie-mode service |
| `fetched-at` | —             | when `threadData` was fetched (epoch ms or ISO); stamped automatically by SSR prefetch |
| `stale-time` | `60000`       | ms a preloaded snapshot is trusted before one client refresh; `Infinity` disables |

`threadData` is a JavaScript-only `CommentTree` property for a preloaded
snapshot.

With the default `live="signed-in"`, only readers who sign in hold a connection
to the service; signed-out visitors read the thread straight from the AppView.
Set `live="all"` to stream for everyone (reasonable when the bridge is your
own), or `live="off"` to disable the stream entirely.

"Not live" does not mean "stale": when the component mounts with a preloaded
snapshot older than `stale-time`, it runs one background revalidation against
the public AppView, so a signed-out reader still sees current comments without
ever connecting to the service. The SSR prefetch stamps `fetched-at`
automatically; hosts passing their own `threadData` can supply it too (or set
`stale-time={Infinity}` to trust their snapshot until a live event arrives).

## Events

- `atproto-comments:loaded`
- `atproto-comments:revalidated`
- `atproto-comments:comment`
- `atproto-comments:live-status`
- `atproto-comments:signed-in`
- `atproto-comments:posted`
- `atproto-comments:error`

Every event's `detail` is documented on the component itself and reaches the
published types as `CustomEvent<unknown>` — they are dispatched through one
shared helper, which the build's source scan cannot narrow.

## Editor and TypeScript support

The package ships a
[custom elements manifest](https://github.com/webcomponents/custom-elements-manifest)
at `custom-elements.json`, which editors read for HTML completions on
`<atproto-comments>`.

TypeScript users need no setup beyond importing the package — the declarations
put the element in `HTMLElementTagNameMap` and narrow `addEventListener`:

```ts
import "@svebcomponents/atproto.comments";

const comments = document.querySelector("atproto-comments");
comments?.addEventListener("atproto-comments:loaded", (event) => {
  console.log(event.detail);
});
```

Svelte, React and Vue template types are not registered automatically: the
standalone build bundles Svelte so the package can be used in applications that
have none. Register them yourself with the exported
`AtprotoCommentsElement`, `AtprotoCommentsAttributes`, `AtprotoCommentsEventMap`
and `AtprotoCommentsEventHandlers` types — see
[typing elements in React & Vue](https://svebcomponents.dev/guides/framework-types/).

See [atproto.svebcomponents.dev](https://atproto.svebcomponents.dev/) for the
full reference and live demo.
