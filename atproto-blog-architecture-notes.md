# ATProto web components product notes

Date: 2026-07-06

This document captures the web components we want to build around Standard.site posts and Bluesky/ATProto comments. Broader notes about Leaflet, Sequoia, PDS architecture, and publishing pipelines are intentionally left out for now.

## Product idea

Build a small set of reusable web components that let any blog render ATProto-native discussion, and optionally render Standard.site article data.

The strongest version is:

```txt
open-source web components
        +
hosted ATProto auth/posting service
```

The components make ATProto comments easy to embed. The hosted service makes authenticated posting possible without each site owner needing to implement ATProto OAuth.

The comments themselves should not live in our database. They should live as ATProto/Bluesky posts in the commenters' own repositories.

## Core pitch

> Drop-in Bluesky/ATProto comments for any blog. Readers sign in with their ATProto account. Comments live in the social web, not in our database.

Alternative:

> A Standard.site-aware comment component and hosted ATProto auth bridge for blogs.

## Components we want

### `<atproto-comments>`

The core comments component.

Basic usage:

```html
<atproto-comments
  thread="at://did:.../app.bsky.feed.post/..."
></atproto-comments>
```

With hosted posting support:

```html
<atproto-comments
  thread="at://did:.../app.bsky.feed.post/..."
  service="https://comments.example.com"
></atproto-comments>
```

Responsibilities:

- Fetch a Bluesky/ATProto thread.
- Render replies as comments.
- Support nested replies.
- Show author identity, handle, avatar, timestamp, and post text.
- Render facets/links reasonably.
- Handle deleted, blocked, muted, or unavailable replies.
- Show moderation labels where appropriate.
- Provide a "Reply on Bluesky" fallback.
- If `service` is configured, support sign-in and direct posting from the page.

This is the most important component.

### `<standard-site-comments>`

A convenience component for Standard.site-aware pages.

Basic usage:

```html
<standard-site-comments></standard-site-comments>
```

Expected behavior:

1. Find the current page's Standard.site document link:

   ```html
   <link rel="site.standard.document" href="at://..." />
   ```

2. Fetch the `site.standard.document` record.
3. Read its `bskyPostRef`.
4. Render the corresponding Bluesky/ATProto thread.
5. If configured with a hosted service, allow direct authenticated replies.

Example with explicit service:

```html
<standard-site-comments
  service="https://comments.example.com"
></standard-site-comments>
```

This is the "low ceremony, high magic" version for blogs that already publish Standard.site records.

### `<standard-site-post>`

A possible article-rendering component.

Basic usage:

```html
<standard-site-post
  uri="at://did:.../site.standard.document/..."
></standard-site-post>
```

With comments:

```html
<standard-site-post
  uri="at://did:.../site.standard.document/..."
  comments
></standard-site-post>
```

Responsibilities:

- Fetch a `site.standard.document` record.
- Render title, description, publish date, author/publication metadata, and content if present.
- Respect canonical URL metadata.
- Render cover images/blobs if present.
- If the document has `bskyPostRef`, optionally render comments below the post.

This is useful, but less urgent than comments. The comments component is the sharper product.

### `<bsky-comments>`?

Possible alias or legacy-friendly name for `<atproto-comments>`.

Pros:

- Immediately understandable to people who want Bluesky comments.
- Matches the real discussion source if we are using `app.bsky.feed.post` threads.

Cons:

- Less future-proof if other ATProto discussion systems emerge.
- Narrows the product framing.

Current preference:

Use `<atproto-comments>` as the primary name, with language in the docs saying it currently renders Bluesky-style `app.bsky.feed.post` threads.

## Read-only mode

Read-only mode should be the first shippable version.

Example:

```html
<script type="module" src="https://cdn.example.com/atproto-comments.js"></script>

<atproto-comments
  thread="at://did:.../app.bsky.feed.post/..."
></atproto-comments>
```

Read-only behavior:

- Fetch the thread from a public API.
- Render replies.
- Provide "Reply on Bluesky" links.
- Require no backend.
- Require no OAuth.
- Require no configuration beyond the thread URI.

This version is simple, safe, and useful by itself.

## Hosted auth/posting mode

Hosted auth is what makes the product substantially more useful.

Example:

```html
<atproto-comments
  thread="at://did:.../app.bsky.feed.post/..."
  service="https://comments.example.com"
></atproto-comments>
```

Flow:

```txt
User clicks "Comment"
→ component contacts hosted service
→ user signs in with ATProto/Bluesky identity
→ hosted service completes OAuth
→ user writes comment on the site
→ hosted service creates an app.bsky.feed.post reply in the user's repo
→ component refreshes the thread
```

The hosted service handles the hard operational pieces:

- ATProto OAuth client metadata.
- Login redirects.
- OAuth callbacks.
- Token exchange.
- Refresh/session handling.
- Secure token storage.
- Handle/DID/PDS resolution.
- Posting `app.bsky.feed.post` replies.
- CORS.
- Rate limits.
- Abuse prevention.
- Optional thread caching.
- Optional moderation/site-owner config.

The hosted service should be an auth and posting bridge, not the canonical data store.

## What posting a comment means

When comments are backed by Bluesky threads, a comment is an `app.bsky.feed.post` reply.

For a top-level comment, the reply's `root` and `parent` point to the blog post's Bluesky discussion root:

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Great post!",
  "createdAt": "2026-07-05T12:00:00.000Z",
  "reply": {
    "root": {
      "uri": "at://did:.../app.bsky.feed.post/...",
      "cid": "bafy..."
    },
    "parent": {
      "uri": "at://did:.../app.bsky.feed.post/...",
      "cid": "bafy..."
    }
  }
}
```

For nested replies, `root` remains the original discussion root and `parent` is the specific comment being replied to.

## OAuth stance

The public component should not ask users for app passwords.

App passwords may be acceptable for private publishing scripts, but they are not appropriate for a public commenting product.

The hosted service should use ATProto OAuth.

The ideal permission model is narrowly scoped:

- enough to identify the user
- enough to create reply posts
- not broad account access if avoidable

The UX should clearly explain that posting a comment creates a public ATProto/Bluesky post from the user's account.

## Data ownership boundary

The service should not own comments.

Ownership should look like:

```txt
Comment text
  lives in the commenter's ATProto repo

Discussion root
  lives in the blog author's ATProto repo as a Bluesky post

Blog article
  lives on the site, optionally mirrored as a Standard.site record

Hosted service
  manages OAuth/session/posting mechanics
```

This is the philosophical and product advantage: the blog renders a public conversation instead of trapping comments in a proprietary database.

## Public API design

Possible attributes for `<atproto-comments>`:

```html
<atproto-comments
  thread="at://did:.../app.bsky.feed.post/..."
  service="https://comments.example.com"
  max-depth="3"
  sort="oldest"
  show-reply-button
></atproto-comments>
```

Potential attributes:

- `thread`: AT URI of the Bluesky/ATProto discussion root.
- `service`: hosted auth/posting service URL.
- `max-depth`: maximum nested reply depth to render.
- `sort`: `oldest`, `newest`, or possibly `popular`.
- `show-reply-button`: whether to show reply affordances.
- `readonly`: force read-only behavior even if a service is configured.
- `theme`: optional visual preset.

Possible JavaScript API:

```js
const comments = document.querySelector("atproto-comments");

comments.thread = "at://did:.../app.bsky.feed.post/...";
comments.service = "https://comments.example.com";

comments.addEventListener("atproto-comment-posted", (event) => {
  console.log(event.detail.uri, event.detail.cid);
});
```

The component should also support preloaded data for SSR/static rendering:

```js
comments.threadData = preFetchedThread;
```

## Hosted service API sketch

The component should be able to ask:

```txt
GET /session
```

to determine whether the user is signed in.

Start auth:

```txt
GET /auth/start?returnTo=...
```

OAuth callback:

```txt
GET /auth/callback
```

Post a reply:

```txt
POST /threads/reply
```

Example request body:

```json
{
  "root": {
    "uri": "at://did:.../app.bsky.feed.post/...",
    "cid": "bafy..."
  },
  "parent": {
    "uri": "at://did:.../app.bsky.feed.post/...",
    "cid": "bafy..."
  },
  "text": "Great post!"
}
```

Example response:

```json
{
  "uri": "at://did:commenter/app.bsky.feed.post/...",
  "cid": "bafy..."
}
```

The exact API can change, but the boundary should stay simple: browser component asks the service to authenticate users and create replies.

## Rendering concerns

The component needs to handle:

- loading states
- empty comment threads
- deleted replies
- unavailable posts
- blocked/muted accounts
- moderation labels
- nested replies
- long threads
- pagination
- links/facets
- mentions
- embeds, at least gracefully
- author avatars
- handle changes
- timestamps
- permalink links
- "view on Bluesky" links

It should avoid:

- assuming all posts are available
- assuming all replies are safe to show without labels/context
- leaking global CSS
- requiring a specific framework
- requiring a backend in read-only mode

## Styling model

The component should be usable without styling, but customizable.

Possible approach:

- Shadow DOM for isolation.
- CSS custom properties for theming.
- `part` attributes for deeper styling.

Example:

```css
atproto-comments {
  --atproto-comments-accent: #2864ff;
  --atproto-comments-border: #ddd;
  --atproto-comments-text: #111;
  --atproto-comments-muted: #666;
}
```

Useful parts:

```txt
container
comment
avatar
author
handle
timestamp
body
actions
reply-button
moderation-label
```

## Product packaging

Recommended split:

### Open-source package

- `<atproto-comments>`
- `<standard-site-comments>`
- maybe `<standard-site-post>`
- read-only rendering
- "Reply on Bluesky" fallback
- framework-neutral usage
- SSR/preloaded-data support
- adapter hooks for custom auth/posting services

### Hosted service

- ATProto OAuth
- direct posting from the page
- session/token handling
- rate limits
- abuse controls
- site configuration
- moderation preferences
- optional cache/performance layer
- optional admin dashboard

This keeps the public component genuinely useful while giving the hosted product a real operational value.

## MVP sequence

### Phase 1: Read-only comments

- Implement `<atproto-comments>`.
- Accept a `thread` AT URI.
- Fetch and render the public thread.
- Render top-level and nested replies.
- Include "Reply on Bluesky" links.
- Provide basic CSS customization.

### Phase 2: Standard.site auto-discovery

- Implement `<standard-site-comments>`.
- Find `<link rel="site.standard.document">`.
- Fetch the document record.
- Read `bskyPostRef`.
- Reuse `<atproto-comments>` to render the thread.

### Phase 3: Hosted auth/posting

- Implement hosted OAuth flow.
- Add sign-in state to the component.
- Allow users to submit replies directly.
- Create `app.bsky.feed.post` replies via the service.
- Refresh the rendered thread after posting.

### Phase 4: Site-owner controls

- Moderation preferences.
- Domain/site allowlists.
- Rate limits.
- Styling presets.
- Dashboard.
- Thread cache settings.

### Phase 5: Optional post rendering

- Implement `<standard-site-post>`.
- Render Standard.site documents.
- Optionally include comments.
- Support preloaded records for SSR/static sites.

## Open questions

- Should the primary public name be `<atproto-comments>` or `<bsky-comments>`?
- How much should the component rely on Bluesky AppView APIs versus direct ATProto repo reads?
- What is the minimal safe OAuth scope for posting replies?
- Should the service support custom domains for auth callbacks?
- How should site owners configure moderation?
- Should the component mirror Bluesky's moderation behavior by default?
- Should replies be rendered in chronological order, Bluesky order, or configurable order?
- How should quote posts be handled?
- Should the hosted service cache thread reads, or should the client fetch directly?
- How much of Standard.site post rendering belongs in the initial product?

## Useful links

- [Standard.site](https://standard.site/)
- [Standard.site document lexicon](https://standard.site/docs/lexicons/document/)
- [AT Protocol](https://atproto.com/)
- [AT Protocol OAuth](https://atproto.com/specs/oauth)

