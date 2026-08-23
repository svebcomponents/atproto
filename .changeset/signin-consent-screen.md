---
"@svebcomponents/atproto.bridge": minor
---

Sign-in page: accurate consent copy, a privacy link, and a real layout.

The page said the reader was approving "posting replies on your behalf for
<site>". Neither half was true of the authorization. ATProto OAuth scopes are
collection + action, so the grant is `repo:app.bsky.feed.post?action=create` —
create any post, not only replies — plus create/delete on likes and reposts.
And the grant is keyed by DID, so it spans every site using the bridge rather
than the one named. Replies-only is a restraint the bridge imposes on itself
in `replyValidation`; it is not a limit of the authorization, and anyone
holding the token set has the broader capability. The page now says what is
actually granted, and notes that the provider will show the exact scopes.

New `privacyUrl` option (absolute, or a path resolved against `publicUrl`)
links the operator's privacy policy from the sign-in footer. Omitted by
default; a public deployment asking strangers for posting authority should
set it.

The page itself was the unstyled default — an oversized heading in a 24rem
column with no container. It is now a proper card: the requesting origin
called out in its own labelled block (it is the security-relevant detail), a
plain list of what approving allows, and light/dark, mobile and focus states
that were not really designed before.
