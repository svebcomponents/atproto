---
"@svebcomponents/atproto.comments": minor
---

New `viewer-name` property: what outbound links call the viewer.

Link text ("Reply on …", "Continue this thread on …") previously used the
literal "Bluesky" for the default viewer and the bare hostname for anything
else, so a self-hosted frontend got "Reply on comments.example.com" with no
way to name it. Set `viewer-name="Deer"` alongside `viewer` to override.

Defaults are unchanged: "Bluesky" when `viewer` is unset, the viewer's
hostname otherwise.
