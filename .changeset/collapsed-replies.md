---
"@svebcomponents/atproto.comments": minor
---

Add a `replies` property for rendering a post as a card.

`replies="collapsed"` keeps the root's replies behind a "Show N replies"
toggle. Until the reader opens them, the component (and its SSR prefetch) only
fetches the root post and holds no live connection; opening them fetches the
thread once. Combined with `show-root`, this renders a single post as a feed
card. The default, `replies="expanded"`, keeps the existing comment section
unchanged.
