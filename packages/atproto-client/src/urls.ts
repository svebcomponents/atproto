import { parseThreadRef } from "./threadRef.js";

/** the default atmosphere web viewer for outbound links */
export const DEFAULT_VIEWER = "https://bsky.app";

/**
 * Normalizes a viewer base URL (no trailing slash). Any viewer using the
 * bsky.app URL scheme (`/profile/…/post/…`, `/hashtag/…`) works — e.g.
 * deer.social or a self-hosted AppView frontend.
 */
const viewerBase = (viewer?: string): string =>
  (viewer ?? DEFAULT_VIEWER).replace(/\/+$/, "");

/** viewer profile page for a handle or DID */
export const viewerProfileUrl = (
  handleOrDid: string,
  viewer?: string,
): string => `${viewerBase(viewer)}/profile/${encodeURIComponent(handleOrDid)}`;

/**
 * Viewer permalink for a post. Prefers the handle for a readable URL when
 * provided, falling back to the AT URI's authority (usually a DID).
 */
export const viewerPostUrl = (
  atUri: string,
  handle?: string,
  viewer?: string,
): string => {
  const ref = parseThreadRef(atUri);
  if (!ref) {
    return viewerBase(viewer);
  }
  const authority = handle ?? ref.authority;
  return `${viewerBase(viewer)}/profile/${encodeURIComponent(authority)}/post/${encodeURIComponent(ref.rkey)}`;
};

/** viewer hashtag search */
export const viewerTagUrl = (tag: string, viewer?: string): string =>
  `${viewerBase(viewer)}/hashtag/${encodeURIComponent(tag)}`;
