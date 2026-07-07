import { parseThreadRef } from "./threadRef.js";

const BSKY_APP = "https://bsky.app";

/** bsky.app profile page for a handle or DID */
export const bskyProfileUrl = (handleOrDid: string): string =>
  `${BSKY_APP}/profile/${encodeURIComponent(handleOrDid)}`;

/**
 * bsky.app permalink for a post. Prefers the handle for a readable URL when
 * provided, falling back to the AT URI's authority (usually a DID).
 */
export const bskyPostUrl = (atUri: string, handle?: string): string => {
  const ref = parseThreadRef(atUri);
  if (!ref) {
    return BSKY_APP;
  }
  const authority = handle ?? ref.authority;
  return `${BSKY_APP}/profile/${encodeURIComponent(authority)}/post/${encodeURIComponent(ref.rkey)}`;
};

/** bsky.app hashtag search */
export const bskyTagUrl = (tag: string): string =>
  `${BSKY_APP}/hashtag/${encodeURIComponent(tag)}`;
