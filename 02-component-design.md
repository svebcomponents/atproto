# Component Design

Date: 2026-07-06

## `<atproto-comments>` — the core component

### Attributes / properties

```html
<atproto-comments
  thread="at://did:plc:…/app.bsky.feed.post/…"  <!-- or https://bsky.app/profile/…/post/… -->
  service="https://comments.example.com"        <!-- enables sign-in + posting -->
  max-depth="4"
  sort="oldest"                                  <!-- oldest | newest | likes | bluesky -->
  readonly                                       <!-- force read-only even with service -->
  revalidate                                     <!-- background-refresh preloaded data -->
  appview="https://public.api.bsky.app"          <!-- escape hatch, defaults to public AppView -->
  labels="hide"                                  <!-- hide | collapse | show : labeled-content policy -->
></atproto-comments>
```

JS-only properties (rich values, no attribute form):

- `threadData: CommentTree` — preloaded normalized thread (SSR Tier 1, see [01-architecture.md](./01-architecture.md)).
- `filters: CommentFilter[]` — optional predicate list (hide no-like comments, min length, mute words). Prior art (czue/bluesky-comments) shows demand for this; cheap to support in the normalize step.

Design notes:

- Accept both AT URIs and bsky.app URLs in `thread` — huge ergonomic win for blog authors who just paste the post URL.
- Attribute→prop conversion comes free via `@svebcomponents/auto-options`; keep prop types simple (string/number/boolean) at the attribute boundary.
- `sort="bluesky"` preserves AppView reply order; `oldest` is the bloggy default.

### Rendering states (each one designed, not incidental)

| State | Treatment |
| --- | --- |
| Loading | Skeleton rows (not spinner) — avoids layout shift, reads "comments are coming" |
| No thread attr & no discovery | Render nothing + console warn (don't break the page) |
| Empty thread | "No comments yet — be the first" + Reply on Bluesky / sign-in CTA |
| Comment | avatar, display name, handle (link to profile), timestamp (permalink to post), rich text body, like count, reply affordance |
| Deleted / not-found | Tombstone row: "comment deleted" — children still render (context preservation) |
| Blocked | Tombstone: "unavailable" — do not leak author info |
| Labeled (moderation) | Per `labels` policy; default `collapse`: body hidden behind "show anyway" with label name |
| Depth-capped | "→ continue this thread on Bluesky" permalink |
| Root stats header | ❤ n likes · 🔁 n reposts · n comments — links to post on bsky.app (this is the "likes via Bluesky" feature; counts come free on `getPostThread`'s root post view) |
| Error / rate-limited | Quiet inline error + retry button; never blank the whole component after data was shown |

### Rich text

Render from **facets** (byte-offset segments — handled in `atproto-client`): links (`app.bsky.richtext.facet#link`), mentions (→ profile links), tags (→ bsky.app tag search). Everything is created via `textContent`/attribute assignment — **no innerHTML of user content, ever**. Embeds (quote posts, images, external cards) in v1: render a compact "view attachment on Bluesky" chip rather than full embeds; full embed rendering is a later enhancement.

### Write UX (when `service` is set and not `readonly`)

1. Signed out: "Sign in with Bluesky to comment" button per thread + per reply affordance.
2. Click → popup to `service/oauth/start` (flow in [03-oauth-service.md](./03-oauth-service.md)); on success component receives session, shows composer.
3. Composer: plain textarea, char counter (300 graphemes — Bluesky limit), clear notice: **"Posting publicly as @handle from your Bluesky account"**. No draft persistence in v1.
4. Submit → optimistic append (pending style) → service confirms `{uri, cid}` → solidify; on failure, restore composer with error.
5. Signed in chrome: small "@handle · sign out" affordance.

Grapheme counting note: Bluesky counts graphemes, not code units — use `Intl.Segmenter` (universal in 2026 browsers) rather than `.length`.

### Events

```js
el.addEventListener("atproto-comments:loaded", (e) => e.detail.thread);
el.addEventListener("atproto-comments:error", (e) => e.detail.error);
el.addEventListener("atproto-comments:signed-in", (e) => e.detail.session /* did, handle */);
el.addEventListener("atproto-comments:posted", (e) => e.detail /* { uri, cid } */);
```

Custom events, `composed: true`, prefixed to avoid collisions.

### Styling

- Shadow DOM (svebcomponents default) for isolation.
- Theme via CSS custom properties, inheriting sensibly by default (`font-family: inherit`, `color: inherit`) so it looks native on any blog with zero config:

```css
atproto-comments {
  --atproto-comments-accent: #2864ff;
  --atproto-comments-border: light-dark(#ddd, #333);
  --atproto-comments-muted: light-dark(#666, #999);
  --atproto-comments-radius: 8px;
}
```

- `part` attributes for structural overrides: `container, header, comment, avatar, author, handle, timestamp, body, actions, reply-button, composer, moderation-label, tombstone`.
- Dark mode: derive from `light-dark()` + custom props; no `theme` attribute needed in v1.

### Accessibility

- Comment list = nested `<ul>`s (screen readers get thread structure free), or `role="tree"` if interaction warrants.
- Timestamps in `<time datetime>`; relative display, absolute on hover/title.
- Composer fully keyboard operable; focus returned sanely after popup auth and after posting.
- "show anyway" moderation toggles are real buttons with state.

## `<standard-site-comments>` — auto-discovery wrapper

```html
<standard-site-comments service="https://comments.example.com"></standard-site-comments>
```

Behavior:

1. Find `document.querySelector('link[rel="site.standard.document"]')` (attribute `document-link` as manual override; also accept an `href` pointing at an `at://` URI directly).
2. Fetch the `site.standard.document` record from the author's PDS (`atproto-client` handles DID→PDS resolution).
3. Read `bskyPostRef` (strong ref: `{ uri, cid }`).
4. Render an internal `<atproto-comments>` with that URI, forwarding all pass-through attributes (`service`, `sort`, `max-depth`, …) and re-dispatching its events.
5. No `bskyPostRef` on the record → render the empty/CTA state with a "discussion not linked" console warning.

SSR: discovery requires the *host document*, which the component can't see server-side. For SSR'd usage, hosts should pass `document-link` explicitly or preload via `threadData`; document that clearly. Client-only usage gets full magic.

## `<standard-site-post>` — deferred (Phase 5)

Renders a `site.standard.document` (title, description, dates, cover image blob via PDS blob URL, `textContent`/`content` union). Real questions to answer when we get there: which `content` `$type`s to support, how much typography opinion to ship. Not needed to prove the product; revisit after comments ship. The lexicon fields are already understood (see research notes in [00-overview.md](./00-overview.md)).

## Testing strategy

- `atproto-client`: pure-function unit tests with recorded `getPostThread` fixtures — especially normalization edge cases (blocked/deleted/depth-capped/labels) and facet byte-offset segmentation (emoji, CJK, combining marks).
- Components: vitest + happy-dom for logic; the monorepo's e2e setup (template ships playwright in the app) for real browser + SSR round-trips: server-render page → assert declarative shadow DOM content → let client upgrade → assert no visual regression / no double fetch (count network calls).
- Service: integration tests against a mocked PDS; see [03-oauth-service.md](./03-oauth-service.md).
