---
"@svebcomponents/atproto.comments": minor
---

Add a `composer` property. `composer="inline"` opens the reply composer
below the post instead of as a modal dialog, so it stays inside the
element's own box and adds to its height. This is for embeds whose height
is bounded, such as a post card in an iframe that grows to fit its content.
The default, `composer="dialog"`, is unchanged.
